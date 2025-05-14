interface DidDocument {
  service?: { type: string; serviceEndpoint: string }[];
}

export async function getPds(did: string): Promise<string> {
  did = decodeURIComponent(did);

  if (!did.startsWith("did:")) {
    throw new Error(`${did} is an invalid DID`);
  }

  let doc: DidDocument;
  
  if (did.startsWith("did:plc:")) {
    doc = await fetch(`https://plc.directory/${did}`, {
      cache: "no-store",
    }).then((res) => {
      if (!res.ok) throw new Error(`Failed to fetch PLC document: ${res.statusText}`);
      return res.json();
    });
  } else if (did.startsWith("did:web:")) {
    const didDomain = did.split(":")[2];
    doc = await fetch(`https://${didDomain}/.well-known/did.json`, {
      cache: "no-store",
    }).then((res) => {
      if (!res.ok) throw new Error(`Failed to fetch DID document: ${res.statusText}`);
      return res.json();
    });
  } else {
    throw new Error("Unsupported DID method");
  }

  // PDS service extraction
  const pdsService = doc.service?.findLast((s) => s.type === "AtprotoPersonalDataServer");
  if (!pdsService || !pdsService.serviceEndpoint) {
    throw new Error(`PDS service not found in the DID document for ${did}`);
  }

  const serviceEndpoint = pdsService.serviceEndpoint;
  
  return serviceEndpoint;
}
