import type { RequestHandler } from "express";
import { passportPublicJwks } from "../services/ssoTicket.js";

// SSO チケットの検証用公開鍵。消費アプリ（お部屋など）がサーバ側から取得する。
// 認証不要の公開エンドポイント。秘密鍵は含まれない。
//
// 鍵ローテーション時は新旧2鍵を並べる期間を作ること。検証側は最大10分キャッシュする。
export const passportJwks: RequestHandler = (_req, res) =>
  res
    // 取得のたびに叩かれないよう短めにキャッシュさせつつ、ローテーションを妨げない長さ。
    .set("Cache-Control", "public, max-age=300")
    .json(passportPublicJwks());
