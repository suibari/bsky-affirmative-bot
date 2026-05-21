import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const getLabelerPublicUrl = () => process.env.LABELER_PUBLIC_URL || process.env.LABELER_SERVER_URL || "http://localhost:3400";
const getLabelerInternalUrl = () => process.env.LABELER_INTERNAL_URL || "http://localhost:3401";
export const botLabelerManager = {
  /**
   * Apply (create or negate) a label for a given DID using the internal loopback API (port 3401).
   * @param did The subject's DID (e.g. did:plc:...)
   * @param val The label value (e.g. bot-tan-sub, super-positive-l1)
   * @param negate Whether to remove/negate this label
   */
  applyLabel: async (did: string, val: string, negate = false) => {
    const url = `${getLabelerInternalUrl()}/label`;

    try {
      const res = await axios.post(
        url,
        { did, val, negate }
      );
      return res.data;
    } catch (e: any) {
      console.error(`[ERROR] Failed to apply label ${val} to ${did}:`, e.response?.data || e.message);
      throw e;
    }
  },
  /**
   * Get currently active DIDs for a specific label value from standard XRPC queryLabels (port 3400).
   * @param val The label value (e.g. bot-tan-sub)
   */
  getActiveLabels: async (val: string): Promise<string[]> => {
    const url = `${getLabelerPublicUrl()}/xrpc/com.atproto.label.queryLabels`;
    const labelerDid = process.env.LABELER_DID;
    if (!labelerDid) {
      console.error("[ERROR] LABELER_DID is not defined in environment");
      return [];
    }

    try {
      const res = await axios.get(url, {
        params: {
          uriPatterns: "*",
          sources: labelerDid,
          limit: 250
        }
      });

      const labels = (res.data.labels || []) as Array<{
        uri: string;
        val: string;
        neg?: boolean;
      }>;

      // Group by subject (uri) and get the latest negated status
      const latestStatus = new Map<string, boolean>();
      for (const label of labels) {
        if (label.val === val) {
          latestStatus.set(label.uri, !!label.neg);
        }
      }

      const activeDids: string[] = [];
      for (const [uri, isNegated] of latestStatus.entries()) {
        if (!isNegated) {
          activeDids.push(uri);
        }
      }

      return activeDids;
    } catch (e: any) {
      console.error(`[ERROR] Failed to query active labels for ${val} via XRPC:`, e.response?.data || e.message);
      return [];
    }
  }
};
