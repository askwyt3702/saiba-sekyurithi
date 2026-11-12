export interface ExploitChoice {
  id: string;
  title: string;
  command: string;
  description: string;
  isCorrect: boolean;
  feedback: string;
}

export interface SecurityChallenge {
  category: string;
  scanTerminalLog: string;
  whyDangerous: string;
  defenseMeasure: string;
  choices: ExploitChoice[];
}

const DISTRACTOR_POOL: Omit<ExploitChoice, 'isCorrect'>[] = [
  {
    id: 'sql_injection',
    title: 'SQLインジェクション攻撃',
    command: `> sqlmap -u "https://target/query?id=1" --payload "' OR 1=1 --"`,
    description: '入力フォームに不正なSQL文を注入し、データベースの認証や検索条件を不正に書き換える。',
    feedback: 'このノードの脆弱性はデータベースのSQL組み立て不備ではありません。スキャン結果の「脆弱性」と「解析ログ」を確認してください。',
  },
  {
    id: 'ssh_bruteforce',
    title: 'SSH辞書攻撃（ブルートフォース）',
    command: `> hydra -l admin -P common_passwords.txt ssh://target:22`,
    description: 'よく使われるパスワードのリスト（辞書）を自動入力し、弱い認証パスワードを突破する。',
    feedback: 'このノードは単純なSSHパスワード推測では突破できません。検出された脆弱性の種類に合った手法を選んでください。',
  },
  {
    id: 'dns_zone_transfer',
    title: 'DNSゾーン転送（AXFR）要求',
    command: `> dig @target axfr internal.corp.local`,
    description: '設定不備のあるDNSサーバーから、内部ネットワークのホスト名・IP一覧を丸ごと取得する。',
    feedback: 'DNSゾーン転送はDNS設定情報の漏洩にのみ有効です。対象ノードのサービスと脆弱性を確認してください。',
  },
  {
    id: 'phishing_macro',
    title: '標的型スピアフィッシング送信',
    command: `> sendmail --spoof it-support@corp.local --attach invoice_macro.docm`,
    description: '漏洩した社員メールアドレス宛に偽装メールを送り、認証トークンや初期侵入足がかりを奪う。',
    feedback: 'フィッシングはメールアドレス漏洩・メール窓口に対して有効な手法です。このノードの技術的脆弱性とは一致しません。',
  },
  {
    id: 'api_token_forge',
    title: '未認証APIエンドポイントの直接呼び出し',
    command: `> curl -X POST https://target/api/v1/admin/control -H "X-Bypass-Auth: true"`,
    description: '認証チェックが漏れているAPIエンドポイントへ直接リクエストを送り、管理機能を操作する。',
    feedback: 'このノードの弱点はAPI認証漏れではありません。「情報確認」でどの設定に不備があるか見直してみましょう。',
  },
  {
    id: 'smb_acl_bypass',
    title: '共有ストレージ・ACL権限バイパス',
    command: `> smbclient //target/shared_archive -N -c "recurse; mget *"`,
    description: 'アクセス制御リスト（ACL）の設定ミスを突き、本来閲覧できない共有ファイルやバックアップを読み出す。',
    feedback: 'このノードはファイル共有やバックアップ領域の公開設定ミスではありません。脆弱性欄を確認してください。',
  },
];

interface SpecificChallengeDef {
  match: string[];
  category: string;
  scanTerminalLog: string;
  whyDangerous: string;
  defenseMeasure: string;
  correct: {
    id: string;
    title: string;
    command: string;
    description: string;
    feedback: string;
  };
  distractorIds: [string, string];
}

const CHALLENGE_DEFINITIONS: SpecificChallengeDef[] = [
  {
    match: ['弱いSSHパスワード', '調査用アカウントの弱い認証'],
    category: '認証・パスワード管理の不備',
    scanTerminalLog: '[SCAN LOG] 22/tcp (SSH) OPEN — パスワード認証が有効、ログイン試行回数制限（Fail2ban等）が未設定。初期パスワードまたは推測容易な認証情報の使用が疑われます。',
    whyDangerous: 'インターネットに公開されたサーバーで「admin123」のような推測しやすいパスワードを使うと、ボットによる辞書攻撃（ブルートフォース攻撃）で数分以内に侵入されてしまいます。',
    defenseMeasure: '【対策】SSHではパスワード認証を無効化して「公開鍵認証」を必須にし、多要素認証（MFA）やログイン失敗時のアカウントロックを導入します。',
    correct: {
      id: 'ssh_bruteforce_ok',
      title: 'SSH辞書攻撃（クレデンシャル・ブルートフォース）',
      command: `> hydra -l root -P leaked_passwords.txt ssh://target:22`,
      description: '推測されやすいパスワードの辞書リストを用いて、回数制限のないSSHログインを突破する。',
      feedback: '【侵入成功！】弱いパスワードに対する辞書攻撃が成功しました。現実のサーバーでは「公開鍵認証の強制」と「多要素認証（MFA）」で防ぐことができます。',
    },
    distractorIds: ['sql_injection', 'dns_zone_transfer'],
  },
  {
    match: ['DNS設定情報の漏洩'],
    category: 'ネットワーク情報漏洩（偵察）',
    scanTerminalLog: '[SCAN LOG] 53/tcp (DNS) OPEN — 外部からのゾーン転送要求（AXFR）が制限されていません。内部ホスト一覧を取得可能です。',
    whyDangerous: 'DNSサーバーの「ゾーン転送（AXFR）」が誰からでも実行できる状態だと、社内ネットワークのサーバー名やIPアドレスの一覧が攻撃者に丸ごと漏洩し、次の攻撃目標を特定されてしまいます。',
    defenseMeasure: '【対策】DNSゾーン転送は信頼されたセカンダリDNSサーバーのIPアドレスのみに制限し、外部向けDNSと内部向けDNSを分離（スプリットホライズン）します。',
    correct: {
      id: 'dns_axfr_ok',
      title: 'DNSゾーン転送（AXFR）による内部構造の抽出',
      command: `> dig @target axfr internal.nullroute.local`,
      description: 'アクセス制限のないDNSサーバーにゾーン転送を要求し、内部ネットワーク構成を丸ごと引き出す。',
      feedback: '【侵入成功！】DNSゾーン転送により内部ネットワークの接続先を特定しました。現実では「ゾーン転送のIP制限」と「内向き/外向きDNSの分離」が必須です。',
    },
    distractorIds: ['ssh_bruteforce', 'sql_injection'],
  },
  {
    match: ['古い公開ファイルのアクセス制御不備', '共有フォルダの権限不備', 'バックアップ領域の権限不備', 'バックアップ領域の設定不備'],
    category: 'アクセス制御（ACL）・ストレージ設定不備',
    scanTerminalLog: '[SCAN LOG] 445/tcp, 8080/tcp OPEN — 匿名アクセス（Anonymous Read）が許可されたディレクトリ・アーカイブ領域を検出。機密ファイルやバックアップが平文で露出しています。',
    whyDangerous: '過去の公開ファイルやバックアップ、社内共有フォルダに「誰でも閲覧可能（Everyone許可）」な権限が残っていると、認証なしで機密データや暗号鍵の断片を持ち出されてしまいます。',
    defenseMeasure: '【対策】「最小権限の原則」に基づき必要なユーザーのみにアクセス権を付与し、不要になった公開ファイルは削除、バックアップは暗号化して隔離保管します。',
    correct: {
      id: 'acl_archive_ok',
      title: 'アクセス制御（ACL）バイパスによる非公開領域の取得',
      command: `> smbclient //target/archive -N -c "prompt OFF; recurse ON; mget *"`,
      description: '権限設定が緩い共有フォルダ・バックアップ領域へ匿名/低権限でアクセスし、内部データを回収する。',
      feedback: '【侵入成功！】権限設定の甘いストレージ領域からデータを取得しました。現実では「最小権限の原則（不要なEveryone権限の削除）」と「バックアップの暗号化」で防ぎます。',
    },
    distractorIds: ['sql_injection', 'dns_zone_transfer'],
  },
  {
    match: ['古いApacheの既知の脆弱性', '古いWebサーバーの設定不備'],
    category: '未パッチの既知脆弱性・Web設定不備',
    scanTerminalLog: '[SCAN LOG] 80/tcp, 443/tcp (HTTP) OPEN — サーバーヘッダよりサポート終了済みの旧バージョンWebサーバーおよびディレクトリトラバーサル可能な設定を検出。',
    whyDangerous: '古いバージョンのWebサーバー（Apache等）を更新せずに放置すると、すでに公開されている攻撃コード（Exploit）を使われて遠隔から任意のコマンドを実行（RCE）されてしまいます。',
    defenseMeasure: '【対策】OS・ミドルウェアのセキュリティパッチを迅速に適用し、サーバーのバージョン情報（Serverヘッダ）の非表示化やWAF（Web Application Firewall）を導入します。',
    correct: {
      id: 'web_rce_ok',
      title: '既知のWebサーバー脆弱性（パストラバーサル / RCE）攻撃',
      command: `> curl --path-as-is "https://target/cgi-bin/.%2e/%2e%2e/bin/sh" -d "id"`,
      description: '未更新のWebサーバーに残るパス解釈の不備を突き、サーバー上でシェル権限を奪取する。',
      feedback: '【侵入成功！】未パッチのWebサーバー脆弱性を突いてシェルを取得しました。現実では「定期的なパッチ適用（脆弱性管理）」と「WAFの導入」が重要です。',
    },
    distractorIds: ['phishing_macro', 'dns_zone_transfer'],
  },
  {
    match: ['漏洩した社員アドレスへのフィッシング', 'メール認証設定の不備'],
    category: 'メールセキュリティ・ソーシャルエンジニアリング',
    scanTerminalLog: '[SCAN LOG] 25/tcp (SMTP) OPEN — SPF / DKIM / DMARC の検証設定が不完全。送信元ドメインを偽装したなりすましメールの注入が可能です。',
    whyDangerous: '送信元認証（SPF/DKIM/DMARC）が正しく設定されていないメールサーバーでは、社内の管理者になりすました偽装メールを送り放題になり、社員の認証情報が盗まれてしまいます。',
    defenseMeasure: '【対策】送信ドメイン認証（SPF・DKIM・DMARC）を厳格に設定してなりすましメールを遮断し、万一パスワードが漏れても突破されないようフィッシング耐性のあるMFAを導入します。',
    correct: {
      id: 'smtp_spoof_ok',
      title: 'SPF/DMARC不備を突いた認証情報奪取（なりすまし注入）',
      command: `> swaks --to staff@corp.local --from admin@corp.local --server target:25`,
      description: 'メール認証設定の不備を突いて内部向けの偽装認証要求を注入し、セッショントークンを獲得する。',
      feedback: '【侵入成功！】メール認証の不備を突いて内部資格情報を取得しました。現実では「SPF/DKIM/DMARCによるなりすまし対策」と「不審メール訓練・MFA」で防ぎます。',
    },
    distractorIds: ['sql_injection', 'dns_zone_transfer'],
  },
  {
    match: ['古いVPN認証方式', '古い暗号認証設定', '証明書管理APIの保護不足', '認証ゲートの設定不備'],
    category: '暗号・VPN・証明書認証の脆弱性',
    scanTerminalLog: '[SCAN LOG] 443/udp, 8443/tcp OPEN — 旧式の暗号プロトコルおよび失効確認のない証明書・トークン検証ロジックを検出。ダウングレードまたはリプレイ攻撃が可能です。',
    whyDangerous: '古いVPN認証方式や暗号アルゴリズム（TLS 1.0/1.1や弱いハッシュ等）を残していると、通信の盗聴や認証トークンの偽造（リプレイ攻撃）によって正規ユーザーになりすまされます。',
    defenseMeasure: '【対策】古い暗号・認証方式を無効化して最新のTLS 1.3およびクライアント証明書＋多要素認証（MFA）へ移行し、証明書の署名検証と失効確認を厳格に行います。',
    correct: {
      id: 'crypto_downgrade_ok',
      title: '暗号ダウングレード＆認証トークンリプレイ攻撃',
      command: `> vpn-exploit --target target:443 --downgrade-auth chap-v1 --replay-token`,
      description: '古い認証方式へ強制的にフォールバックさせ、脆弱なチャレンジ応答から認証を突破する。',
      feedback: '【侵入成功！】古い暗号・認証方式の弱点を突いてゲートを突破しました。現実では「レガシー認証方式の廃止」と「最新TLS＋多要素認証の強制」が必要です。',
    },
    distractorIds: ['sql_injection', 'phishing_macro'],
  },
  {
    match: ['认证情報の不適切な保存', '認証情報の不適切な保存', '管理用資格情報の保存不備'],
    category: '資格情報（クレデンシャル）の平文保存・管理不備',
    scanTerminalLog: '[SCAN LOG] LOCAL/CACHE — 設定ファイル・メモリキャッシュ内に暗号化されていない平文トークンおよびパスワードハッシュ（Pass-the-Hash可能）を検出。',
    whyDangerous: '設定ファイルやキャッシュにパスワードやAPIキーを平文（そのまま読める状態）で保存していると、1台の端末に侵入されただけで管理者権限まで一気に奪われてしまいます。',
    defenseMeasure: '【対策】パスワードや秘密鍵のハードコード・平文保存を禁止し、シークレット管理基盤（HSM / Vault）での暗号化保管と、短寿命な一時トークンの利用を徹底します。',
    correct: {
      id: 'credential_dump_ok',
      title: 'クレデンシャルダンプ＆Pass-the-Hash攻撃',
      command: `> cred-extractor --dump-cache /var/cache/auth.db --pass-the-hash`,
      description: '不適切に保存されたキャッシュ・設定ファイルから認証情報を抽出し、そのまま上位認証へ再利用する。',
      feedback: '【侵入成功！】平文・キャッシュ保存されていた資格情報を抽出しました。現実では「設定ファイルへの平文保存の禁止」と「シークレット管理ツールの導入」で防ぎます。',
    },
    distractorIds: ['dns_zone_transfer', 'sql_injection'],
  },
  {
    match: ['Active Directoryの権限設定ミス', '認証権限の設定ミス', '開発用サービスの保護不足', '解析基盤のアクセス制御不備'],
    category: '権限昇格・アイデンティティ管理の不備',
    scanTerminalLog: '[SCAN LOG] 389/tcp, 88/tcp (LDAP/Kerberos) — 一般ユーザー権限から管理者グループの設定変更やトークン発行が可能な過剰権限（ACL設定ミス）を検出。',
    whyDangerous: 'Active Directoryや社内認証サーバーで「一般アカウントに管理操作まで許可してしまう」設定ミスがあると、攻撃者に一般社員からドメイン管理者（ADMIN/ROOT）へ権限昇格されてしまいます。',
    defenseMeasure: '【対策】特権アカウント（管理者権限）の分離、最小権限の原則の徹底、定期的な権限棚卸し（IAM監査）を実施します。',
    correct: {
      id: 'priv_escalation_ok',
      title: 'ACL設定ミスを突いた特権トークン奪取（権限昇格）',
      command: `> ad-privesc --dc target --request-admin-ticket --impersonate`,
      description: '過剰に付与されたディレクトリ/サービス権限を悪用し、上位階層の管理者トークンを発行させる。',
      feedback: '【侵入成功！】権限設定ミスを突いて上位権限を獲得しました。現実では「特権IDの分離」と「定期的なアクセス権限の棚卸し」が不可欠です。',
    },
    distractorIds: ['phishing_macro', 'dns_zone_transfer'],
  },
  {
    match: ['SQLインジェクション', 'データベース権限設定の不備', '証跡DBの権限設定不備'],
    category: 'データベース・インジェクション／権限不備',
    scanTerminalLog: '[SCAN LOG] 5432/tcp, 3306/tcp (DB) — クエリ入力値のサニタイズ不足、またはアプリケーション用DBアカウントに過剰な全テーブル参照権限（SUPERUSER相当）を検出。',
    whyDangerous: 'ユーザー入力をそのままSQL文に連結すると「SQLインジェクション」で全データを抜き取られます。また、DBアカウントの権限が強すぎると機密テーブルまで一括で回収されてしまいます。',
    defenseMeasure: '【対策】SQLの組み立てには必ず「プリペアドステートメント（パラメータ化クエリ）」を使用し、DB接続アカウントには必要最小限のテーブル権限のみを付与します。',
    correct: {
      id: 'db_exploit_ok',
      title: 'SQLインジェクション／過剰DB権限による機密テーブル抽出',
      command: `> db-audit-exploit --target target:5432 --inject "UNION SELECT * FROM classified_records--"`,
      description: 'パラメータ処理やDBロール権限の不備を突き、保護された機密レコードへのアクセス権を取得する。',
      feedback: '【侵入成功！】データベースの制御不備を突いて機密領域へ侵入しました。現実では「プリペアドステートメントの使用」と「DBロール権限の最小化」で防御します。',
    },
    distractorIds: ['ssh_bruteforce', 'phishing_macro'],
  },
  {
    match: ['監視システムの設定不備', 'ログ管理権限の不備', '監視制御APIの認証不備', '監査ログ管理の権限不備', '制御端末の認証不備'],
    category: 'ログ・監視システム（SIEM/EDR）の保護不備',
    scanTerminalLog: '[SCAN LOG] 9200/tcp, 514/tcp (LOG/SIEM) — 監査ログ・監視制御インターフェースに対する書き込み制限およびAPI認証が欠落しています。',
    whyDangerous: '監視システムやログサーバー自体の権限管理が甘いと、攻撃者に「侵入した証拠（監査ログ）」を消去されたり、アラート通知を止められて長期間潜伏されてしまいます。',
    defenseMeasure: '【対策】監査ログは「追記専用（改ざん不能なWORMストレージ）」または別ネットワークへ即時転送して保存し、監視制御APIには厳格な相互認証を適用します。',
    correct: {
      id: 'log_tamper_ok',
      title: '監視制御APIの未認証操作＆監査ログ改ざん',
      command: `> siem-ctl --endpoint https://target:9200/api/alerts --suppress-trace`,
      description: '保護が不十分な監視API・ログ管理権限を操作し、侵入痕跡の削減と監視アラートの抑制を行う。',
      feedback: '【侵入成功！】監視・ログ基盤の保護不備を突いて警戒制御を掌握しました。現実では「ログの改ざん防止（別拠点への即時転送・WORM保管）」が極めて重要です。',
    },
    distractorIds: ['sql_injection', 'dns_zone_transfer'],
  },
];

export function getSecurityChallenge(
  nodeId: string,
  vulnerability: string | null | undefined,
  nodeInfo?: string | null,
): SecurityChallenge {
  const vulnText = (vulnerability ?? '').trim();

  const found = CHALLENGE_DEFINITIONS.find((def) =>
    def.match.some((keyword) => vulnText.includes(keyword)),
  );

  if (found) {
    const distractors = found.distractorIds
      .map((id) => DISTRACTOR_POOL.find((d) => d.id === id))
      .filter((d): d is Omit<ExploitChoice, 'isCorrect'> => Boolean(d))
      .map((d) => ({ ...d, isCorrect: false }));

    const choices: ExploitChoice[] = [
      { ...found.correct, isCorrect: true },
      ...distractors,
    ];

    // ノードIDに応じて選択肢の並び順を決定論的にシャッフル（毎回同じ場所が正解にならないようにする）
    const shift = nodeId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % choices.length;
    const rotated = [...choices.slice(shift), ...choices.slice(0, shift)];

    return {
      category: found.category,
      scanTerminalLog: found.scanTerminalLog,
      whyDangerous: found.whyDangerous,
      defenseMeasure: found.defenseMeasure,
      choices: rotated,
    };
  }

  // デフォルト（管理画面・プロキシ・ルーター・ファイアウォール等の設定・アクセス制御不備全般）
  const defaultChoices: ExploitChoice[] = [
    {
      id: 'config_auth_bypass',
      title: '管理インターフェースのアクセス制御バイパス',
      command: `> exploit/config_bypass --target ${nodeId} --vuln "${vulnText || 'misconfig'}"`,
      description: `検出された「${vulnText || '設定・アクセス制御の不備'}」を突き、保護されていない管理経路から権限を取得する。`,
      isCorrect: true,
      feedback: `【侵入成功！】「${vulnText || '設定不備'}」を突いて制御を奪取しました。現実では「管理ポートのIP制限・ゼロトラスト認証」と「設定監査の自動化」で防ぐことができます。`,
    },
    { ...DISTRACTOR_POOL[0], isCorrect: false },
    { ...DISTRACTOR_POOL[3], isCorrect: false },
  ];

  const shift = nodeId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % defaultChoices.length;
  const rotated = [...defaultChoices.slice(shift), ...defaultChoices.slice(0, shift)];

  return {
    category: 'アクセス制御・構成設定の不備（Security Misconfiguration）',
    scanTerminalLog: `[SCAN LOG] NODE ${nodeId} — 「${vulnText || '設定不備'}」を検出。${nodeInfo ? `補足情報: ${nodeInfo}` : '管理インターフェースへのアクセス制限が不十分です。'}`,
    whyDangerous: `サーバーやネットワーク機器の「${vulnText || '設定不備'}」を放置すると、本来許可されていない経路から管理機能を操作され、内部ネットワーク深部への踏み台にされてしまいます。`,
    defenseMeasure: '【対策】管理画面や制御ポートへのアクセス元IP制限、デフォルト設定の見直し、最小権限の原則に基づいた構成管理（CSPM等の自動監査）を実施します。',
    choices: rotated,
  };
}
