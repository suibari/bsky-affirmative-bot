# Zenkoutei Bot-tan

全肯定botたん は、フォロワーに全肯定のリプライを送るBluesky botです。
感情分析および生成AIを活用し、フォロワーを励ますことを目的とします。

本botは基本的に日本語のポストを解析対象とします。

---

## 概要

このリポジトリには、全肯定botたんのコードと設定ファイルが含まれています。
本botは次の2つのモードで動作します。

1. **AI生成リプライ**: 生成AI (Google Gemini) を使用し、フォロワーの文章または画像に応じてリプライします
2. **定型文リプライ**: 日本語極性辞書を使用し、あらかじめ用意した定型文リストから、リプライします

---

## プライバシーポリシー

### 情報の収集

本botは、次の情報を収集し処理します：

- **フォロワーの投稿内容**: 投稿内容はリプライを生成する目的でのみ利用され、保存や二次利用は行いません
- **ユーザーメタデータ**: ユーザー名やプロフィール情報など、応答を個別化するための最低限のデータにアクセスしますが、これらのデータは保存されません

### 情報の利用目的

本botで収集した情報は、以下の目的に使用されます：

- Google Geminiを活用したAI生成リプライの作成
- 定型文リプライの選択

本botが収集した情報は、リプライ生成以外の目的では第三者と共有されません。ただし、Google Gemini APIとのデータ通信には必要な情報を含みます。

### 年齢制限
本botはGoogle Gemini APIの利用規約に準拠しており、18歳以上のユーザのみを対象としています。18歳未満の方は以下使用方法に示す"U18モード"で利用するか、利用をお控えください。

### 地域制限
本botはGoogle Gemini APIの利用規約に準拠しており、次の地域ではご利用いただけません：

- イギリス（UK）
- スイス（Switzerland）
- 欧州連合加盟国（EU Member States）

これらの地域にお住まいの方は、本botのご利用を控えていただきますようお願いいたします。

### プライバシーポリシーの変更
プライバシーポリシーは適宜更新されることがあります。重大な変更があった場合は、本リポジトリにて通知します。

### 問い合わせ
本ボットまたはプライバシーポリシーに関するお問い合わせは、次の連絡先までお願いします：
[すいばり (suibari-cha.bsky.social)](https://bsky.app/profile/suibari-cha.bsky.social)

---

## 使用方法
1. Blueskyで本botをフォローしてください
2. これにより本botがフォローバックし、以降、あなたのポストに反応するようになります

本botのフォロー解除、またはユーザブロックにより、以降、反応しなくなります

### U18モード
U18モードはGoogle Gemini APIの利用規約に準拠し、年齢制限に必要な措置として実装しました。
18歳未満のユーザは、以下の手順を実施するか、本botの仕様を控えて頂きますようお願いいたします。

1. "使用方法"に従い、本botからフォローされた状態となる
2. 本botに対しメンションまたはリプライで"U18モード"とポストする
3. 本botがあなたにU18モードを設定した旨をリプライします

18歳以上となったユーザは、以下の手順によりU18モードを解除できます。

1. "使用方法"に従い、本botからフォローされた状態となる
2. 本botに対しメンションまたはリプライで"U18モード解除"とポストする
3. 本botがあなたにU18モードを解除した旨をリプライします

---

## ライセンス
このプロジェクトはMITライセンスの下で提供されています。詳細は [LICENSE](./LICENSE) ファイルをご覧ください。

---

## 免責事項
本botは、すいばり自身の技術スキルアップおよびAT-Protocolの理解のために、個人で開発・運用・管理されています。
そのため、企業が実施しているような手厚いサポートやアップデートは実施が難しいです。

本botは正常な稼働に向けて可能な限りの改善・改修の努力をしますが、前提として自己責任でのご利用をお願いいたします。
また本botを利用したことによる過失や損害につきまして、開発者は一切の責任を負いません。ご了承ください。

---