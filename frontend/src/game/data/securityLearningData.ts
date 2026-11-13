export type QuestionTypeLabel =
  | 'TYPE A: エクスプロイト選択（攻撃手法の特定）'
  | 'TYPE B: 設定ファイル・ログ解析（弱点箇所の特定）'
  | 'TYPE C: ペイロード＆防御コマンド解析（実践応用）';

export interface ExploitChoice {
  id: string;
  title: string;
  command: string;
  description: string;
  isCorrect: boolean;
  feedback: string;
}

export interface ChallengeQuestion {
  id: string;
  questionType: QuestionTypeLabel;
  prompt: string;
  codeSnippet?: string;
  choices: ExploitChoice[];
}

export interface SecurityChallenge {
  category: string;
  mitreId?: string;
  cweId?: string;
  scanTerminalLog: string;
  whyDangerous: string;
  defenseMeasure: string;
  questions: ChallengeQuestion[];
  /** 後方互換用（先頭問題の選択肢） */
  choices: ExploitChoice[];
}

interface RawChoice {
  id: string;
  title: string;
  command: string;
  description: string;
  isCorrect: boolean;
  feedback: string;
}

interface RawQuestion {
  id: string;
  questionType: QuestionTypeLabel;
  prompt: string;
  codeSnippet?: string;
  choices: RawChoice[];
}

interface ChallengeGroupDef {
  match: string[];
  category: string;
  mitreId?: string;
  cweId?: string;
  scanTerminalLog: string;
  whyDangerous: string;
  defenseMeasure: string;
  questions: RawQuestion[];
}

function rotateChoices(choices: RawChoice[], seedStr: string): ExploitChoice[] {
  const shift = seedStr.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % choices.length;
  return [...choices.slice(shift), ...choices.slice(0, shift)];
}

const CHALLENGE_GROUPS: ChallengeGroupDef[] = [
  // ==========================================
  // 1. SSH・初期認証・弱いパスワード系 (external-1, E01, S2-E01)
  // ==========================================
  {
    match: ['弱いSSHパスワード', '調査用アカウントの弱い認証'],
    category: '認証・パスワード管理の不備 (Brute Force / Weak Auth)',
    mitreId: 'T1110.001 (Password Guessing)',
    cweId: 'CWE-521 (Weak Password Requirements)',
    scanTerminalLog:
      '[SCAN LOG] 22/tcp (OpenSSH) OPEN — PasswordAuthentication yes / MaxAuthTries 無制限。辞書攻撃に対するアカウントロック機構が未設定です。',
    whyDangerous:
      '公開サーバーで推測しやすいパスワード（admin123等）を許可し、ログイン試行回数の制限を設けていない場合、自動化ボットの辞書攻撃で数分以内に突破されます。',
    defenseMeasure:
      '【対策】SSHではパスワード認証を無効化して「公開鍵認証」を強制し、Fail2ban等による試行回数制限および多要素認証（MFA）を導入します。',
    questions: [
      {
        id: 'ssh-q1',
        questionType: 'TYPE A: エクスプロイト選択（攻撃手法の特定）',
        prompt: '22/tcp (SSH) でパスワード認証が有効かつ試行回数制限がありません。最も有効な侵入手法を選んでください。',
        choices: [
          {
            id: 'ssh_bf',
            title: 'SSH辞書攻撃（クレデンシャル・ブルートフォース）',
            command: '> hydra -l admin -P rockyou_top1000.txt ssh://target:22 -t 4',
            description: '漏洩パスワード辞書リストを自動試行し、回数制限のないSSH認証を突破する。',
            isCorrect: true,
            feedback: '【正解！】弱いSSHパスワード＋回数制限なしの状態には辞書攻撃が直撃します。対策には「公開鍵認証の強制」が必須です。',
          },
          {
            id: 'ssh_sqli',
            title: 'SQLインジェクション攻撃',
            command: `> sqlmap -u "https://target/login" --payload "' OR 1=1 --"`,
            description: 'WebフォームのSQL文組み立て不備を突いてデータベース認証を回避する。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】SSHデーモン(22/tcp)はSQLクエリを受け付けません。無関係な攻撃ペイロードによりIDSに検知されました。',
          },
          {
            id: 'ssh_axfr',
            title: 'DNSゾーン転送（AXFR）要求',
            command: '> dig @target axfr internal.corp.local',
            description: 'DNSサーバーからドメイン内のホスト一覧を取得する。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】対象はSSHゲートウェイであり、DNSゾーン転送要求は異常通信として検知されました。',
          },
        ],
      },
      {
        id: 'ssh-q2',
        questionType: 'TYPE B: 設定ファイル・ログ解析（弱点箇所の特定）',
        prompt: '対象サーバーの `/etc/ssh/sshd_config` の抜粋です。今回の脆弱性の直接の原因となっている危険な設定行はどれですか？',
        codeSnippet:
          'Line A: Port 22\nLine B: PermitRootLogin yes / PasswordAuthentication yes\nLine C: UsePAM yes',
        choices: [
          {
            id: 'ssh_cfg_b',
            title: 'Line B: PermitRootLogin yes / PasswordAuthentication yes',
            command: 'sshd_config: PermitRootLogin yes / PasswordAuthentication yes',
            description: 'rootアカウントへの直接ログインとパスワード認証の両方を許可してしまっている設定。',
            isCorrect: true,
            feedback: '【正解！】rootの直接ログイン許可とパスワード認証許可が最大の原因です。`PermitRootLogin no` と `PasswordAuthentication no` に変更すべきです。',
          },
          {
            id: 'ssh_cfg_a',
            title: 'Line A: Port 22 のみ（ポート番号だけの問題）',
            command: 'sshd_config: Port 22',
            description: 'SSHの標準ポート22番を使っていること自体が脆弱性の本体である。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】ポート番号を変えても、弱いパスワード認証が有効なままならスキャンで容易に発見・突破されます。',
          },
          {
            id: 'ssh_cfg_c',
            title: 'Line C: UsePAM yes',
            command: 'sshd_config: UsePAM yes',
            description: 'Linuxの認証モジュール機構（PAM）を有効化している設定。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】PAMの有効化自体は標準的な管理設定であり、弱いパスワード許容の原因ではありません。',
          },
        ],
      },
    ],
  },

  // ==========================================
  // 2. DNS情報漏洩・中継設定不備系 (E02, S2-D01, S2-D03)
  // ==========================================
  {
    match: ['DNS設定情報の漏洩', '中継サービスの設定不備', '集約サービスの権限設定不備'],
    category: 'ネットワーク構成・DNS/中継情報漏洩 (Reconnaissance)',
    mitreId: 'T1590.002 (DNS Reconnaissance)',
    cweId: 'CWE-200 (Information Exposure)',
    scanTerminalLog:
      '[SCAN LOG] 53/tcp (DNS) / 8081/tcp (Relay) OPEN — allow-transfer { any; }; が設定されており、外部ホストからのゾーン転送・ルーティングテーブル照会が無制限に許可されています。',
    whyDangerous:
      'DNSゾーン転送や中継テーブルが誰からでも取得できる状態だと、社内にある非公開サーバーのIPアドレスや役割がすべて攻撃者に知られ、ピンポイントで狙われてしまいます。',
    defenseMeasure:
      '【対策】DNSの `allow-transfer` はセカンダリDNSのIPのみに限定し、外部公開用DNSと社内用DNSを分離（スプリットホライズン）します。',
    questions: [
      {
        id: 'dns-q1',
        questionType: 'TYPE A: エクスプロイト選択（攻撃手法の特定）',
        prompt: 'DNS/中継サーバーから内部ネットワークの接続先リストを一括抽出するためのコマンドを選んでください。',
        choices: [
          {
            id: 'dns_axfr',
            title: 'DNSゾーン転送（AXFR）クエリの実行',
            command: '> dig @target axfr internal.nullroute.local',
            description: '制限されていないAXFRクエリを送信し、内部ドメインの全レコードを一括取得する。',
            isCorrect: true,
            feedback: '【正解！】ゾーン転送（AXFR）の制限漏れを突くことで、スキャン音を立てずに内部ホスト構成を把握できました。',
          },
          {
            id: 'dns_xss',
            title: 'クロスサイトスクリプティング（XSS）注入',
            command: '> curl "http://target/?q=<script>alert(1)</script>"',
            description: 'Webブラウザ上で悪意あるJavaScriptを実行させる。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】DNS/中継サーバーに対してブラウザ向けスクリプトを送信したため、WAF/IDSに異常パケットとして検知されました。',
          },
          {
            id: 'dns_rdp',
            title: 'RDP（リモートデスクトップ）BlueKeep攻撃',
            command: '> exploit/windows/rdp/cve_2019_0708_bluekeep --target 3389',
            description: 'Windowsのリモートデスクトップ(3389/tcp)の脆弱性を突く。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】対象はDNS/通信中継サーバーであり、無関係なポート3389への攻撃でアラートが発生しました。',
          },
        ],
      },
      {
        id: 'dns-q2',
        questionType: 'TYPE B: 設定ファイル・ログ解析（弱点箇所の特定）',
        prompt: '以下はDNSサーバー（BIND `named.conf`）の設定抜粋です。情報漏洩を引き起こしている致命的な設定はどれですか？',
        codeSnippet:
          'zone "internal.corp.local" {\n  type master;\n  file "/etc/bind/db.internal";\n  allow-transfer { any; };\n};',
        choices: [
          {
            id: 'dns_cfg_ok',
            title: 'allow-transfer { any; }; （全ホストへのゾーン転送許可）',
            command: 'fix: allow-transfer { 10.0.0.2; }; // セカンダリDNSのみに制限',
            description: 'インターネット上の誰からでも内部ゾーン情報の丸ごとコピー（AXFR）を許可してしまっている行。',
            isCorrect: true,
            feedback: '【正解！】`allow-transfer { any; };` があると誰でも全ホスト一覧を取得できます。信頼できるセカンダリサーバーのIPだけに絞る必要があります。',
          },
          {
            id: 'dns_cfg_ng1',
            title: 'type master; （プライマリサーバー指定）',
            command: 'named.conf: type master;',
            description: 'このDNSサーバーをマスター（プライマリ）として動作させる宣言。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】マスターサーバーであること自体は正常な構成です。問題は誰に転送を許可しているか（allow-transfer）です。',
          },
          {
            id: 'dns_cfg_ng2',
            title: 'file "/etc/bind/db.internal"; （ゾーンファイルのパス）',
            command: 'named.conf: file "/etc/bind/db.internal";',
            description: 'ゾーン情報を保存するローカルファイルパスの指定。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】ローカルファイルパスの指定自体は外部漏洩の原因ではありません。',
          },
        ],
      },
    ],
  },

  // ==========================================
  // 3. ファイル共有・公開アーカイブ・バックアップ権限不備系 (E03, I05, I06, S2-I06)
  // ==========================================
  {
    match: [
      '古い公開ファイルのアクセス制御不備',
      '共有フォルダの権限不備',
      'バックアップ領域の権限不備',
      'バックアップ領域の設定不備',
    ],
    category: 'アクセス制御（ACL）・ストレージ設定不備',
    mitreId: 'T1039 (Data from Network Shared Drive)',
    cweId: 'CWE-732 (Incorrect Permission Assignment)',
    scanTerminalLog:
      '[SCAN LOG] 445/tcp (SMB) / 8080/tcp (Archive) OPEN — Guest / Everyone に対して Read 権限が開放されています。機密バックアップ・鍵断片ファイルへ無認証でアクセス可能です。',
    whyDangerous:
      '共有フォルダやクラウドストレージ（S3等）、バックアップ領域に「誰でも閲覧可能（Anonymous/Everyone）」な設定が残っていると、パスワードすら破られずに機密ファイルや暗号鍵を持ち出されます。',
    defenseMeasure:
      '【対策】「最小権限の原則」に基づき、不要なゲスト・Everyone権限を削除し、バックアップや重要ファイルは暗号化して別セグメントに隔離します。',
    questions: [
      {
        id: 'acl-q1',
        questionType: 'TYPE A: エクスプロイト選択（攻撃手法の特定）',
        prompt: 'アクセス制限（ACL）が外れている共有アーカイブ・バックアップ領域からファイルを回収する手法を選んでください。',
        choices: [
          {
            id: 'acl_smb',
            title: '匿名（Null Session）接続による共有ストレージ一括取得',
            command: '> smbclient //target/backup_archive -N -c "recurse ON; prompt OFF; mget *"',
            description: '認証不要（-N）で開放されている共有ディレクトリへ接続し、保管ファイルを回収する。',
            isCorrect: true,
            feedback: '【正解！】ACL設定ミスにより、ゲスト権限のままバックアップ・鍵断片ファイルを回収できました。',
          },
          {
            id: 'acl_bof',
            title: 'カーネルヒープ・バッファオーバーフロー攻撃',
            command: '> exploit/linux/local/heap_overflow --crash-kernel',
            description: 'OSカーネルのメモリ破壊を引き起こしてクラッシュ・権限奪取を狙う。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】正規の読み取り権限が開いているのに危険なメモリ破壊攻撃を行ったため、EDRに検知されました。',
          },
          {
            id: 'acl_csrf',
            title: 'クロスサイトリクエストフォージェリ（CSRF）罠ページ誘導',
            command: '> gen-csrf-trap --action "https://target/delete_all"',
            description: 'ログイン中の管理者に罠サイトを踏ませて意図しないリクエストを送らせる。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】ファイルサーバーに対してCSRF罠は機能せず、不審な通信として記録されました。',
          },
        ],
      },
      {
        id: 'acl-q2',
        questionType: 'TYPE B: 設定ファイル・ログ解析（弱点箇所の特定）',
        prompt: 'ファイルサーバーの `/etc/samba/smb.conf` の設定です。無認証で機密ファイルが読めてしまう原因となっている行はどれですか？',
        codeSnippet:
          '[corporate_archive]\n  path = /srv/samba/archive\n  guest ok = yes\n  read only = yes',
        choices: [
          {
            id: 'acl_cfg_ok',
            title: 'guest ok = yes （ゲスト・匿名アクセスの許可）',
            command: 'smb.conf: guest ok = yes  -->  guest ok = no に修正すべき',
            description: '認証していないユーザー（Guest）でもフォルダ内の全ファイルを閲覧可能にしている設定。',
            isCorrect: true,
            feedback: '【正解！】`guest ok = yes` があると誰でも認証なしで中身を取得できます。社内機密やバックアップでは必ず `guest ok = no` と `valid users` 指定が必要です。',
          },
          {
            id: 'acl_cfg_ng1',
            title: 'read only = yes （読み取り専用設定）',
            command: 'smb.conf: read only = yes',
            description: 'ファイルの書き換えを禁止し、読み取り専用にしている設定。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】読み取り専用にしていても、機密データや暗号鍵は「読み取られる（盗まれる）」だけで致命的な情報漏洩になります。',
          },
          {
            id: 'acl_cfg_ng2',
            title: 'path = /srv/samba/archive （保存先ディレクトリ）',
            command: 'smb.conf: path = /srv/samba/archive',
            description: 'サーバー内のディレクトリパスの指定。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】Linux標準の `/srv` 配下に置くこと自体は問題ではありません。',
          },
        ],
      },
    ],
  },

  // ==========================================
  // 4. 古いWebサーバー・管理画面・API認証不備系 (dmz-1, D01, D04, I10, S2-D02, S2-D04)
  // ==========================================
  {
    match: [
      '古いApacheの既知の脆弱性',
      '古いWebサーバーの設定不備',
      '管理画面のアクセス制御不備',
      '研究用APIの認証不備',
      '認証窓口のアクセス制御不備',
      '管理プロキシの認証不備',
    ],
    category: 'Webサーバー・管理APIの脆弱性 (OWASP Broken Access Control / Vuln Components)',
    mitreId: 'T1190 (Exploit Public-Facing Application)',
    cweId: 'CWE-22 (Path Traversal) / CWE-284',
    scanTerminalLog:
      '[SCAN LOG] 80/tcp, 443/tcp (HTTP/API) OPEN — パストラバーサル可能な旧バージョンWebサーバー、および認証ミドルウェアを通過しない `/admin`・`/api/v1/internal` エンドポイントを検出。',
    whyDangerous:
      'Webサーバーの更新放置（既知のCVE）や、管理画面・内部APIの認証チェック漏れ（URLを直接叩けば誰でもアクセスできる状態）は、外部からの最短侵入ルートとして最も多く悪用されます。',
    defenseMeasure:
      '【対策】Webサーバー・フレームワークの迅速なパッチ適用、管理画面へのIP制限＋多要素認証、すべてのAPIルートでの認可チェック徹底を行います。',
    questions: [
      {
        id: 'web-q1',
        questionType: 'TYPE A: エクスプロイト選択（攻撃手法の特定）',
        prompt: '未保護のWeb管理エンドポイント／既知脆弱性を持つWebサーバーを突破する手法を選んでください。',
        choices: [
          {
            id: 'web_bypass',
            title: 'パストラバーサル＆未認可管理APIの直接呼び出し',
            command: '> curl -i "https://target/api/../admin/token?export=true" -H "X-Forwarded-For: 127.0.0.1"',
            description: 'URLパス正規化の不備と送信元ヘッダ偽装を組み合わせ、保護されていない管理機能から権限を取得する。',
            isCorrect: true,
            feedback: '【正解！】パストラバーサルとアクセス制御不備を突き、管理セッションを奪取しました。リバースプロキシでの正規化と厳格な認可チェックが必要です。',
          },
          {
            id: 'web_arp',
            title: '同一LAN内ARPスプーフィング（中間者攻撃）',
            command: '> arpspoof -i eth0 -t 192.168.1.10 192.168.1.1',
            description: '同一イーサネットセグメント内でMACアドレスを偽装して通信を盗聴する。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】ARPはレイヤー2（同一LAN内）でしか届かず、ルーター越しのWebサーバーには無効なうえ異常フレームとして検知されました。',
          },
          {
            id: 'web_macro',
            title: 'Wordマクロ付きメールの一斉送信',
            command: '> send-phish --attachment update.docm',
            description: 'メール添付ファイルを開かせてマルウェアを実行させる。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】対象はWeb/APIサーバーであり、メール添付ファイルによる攻撃は通用しません。',
          },
        ],
      },
      {
        id: 'web-q2',
        questionType: 'TYPE C: ペイロード＆防御コマンド解析（実践応用）',
        prompt: 'リバースプロキシ（Nginx）で `/admin/` への外部アクセスを遮断し、社内管理ネットワーク（`10.10.0.0/16`）からのみ許可する正しい防御設定はどれですか？',
        codeSnippet:
          'location /admin/ {\n  # ここに入れるべきアクセス制御ディレクティブは？\n  proxy_pass http://backend_admin;\n}',
        choices: [
          {
            id: 'web_def_ok',
            title: 'allow 10.10.0.0/16; deny all;',
            command: 'location /admin/ { allow 10.10.0.0/16; deny all; }',
            description: '信頼された管理サブネットのみを許可し、それ以外の全IPからのアクセスを拒否（ホワイトリスト方式）する。',
            isCorrect: true,
            feedback: '【正解！】アクセス制御の基本は「原則すべて拒否（deny all）＋必要な送信元だけ許可（ホワイトリスト）」です！',
          },
          {
            id: 'web_def_ng1',
            title: 'autoindex on; allow all;',
            command: 'location /admin/ { autoindex on; allow all; }',
            description: 'ディレクトリ内のファイル一覧表示を有効にし、全ホストからの接続を許可する。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】`autoindex on; allow all;` は逆にファイル一覧を全世界に公開してしまう危険な設定です！',
          },
          {
            id: 'web_def_ng2',
            title: 'X-Frame-Options: ALLOWALL のみ設定',
            command: 'add_header X-Frame-Options "ALLOWALL";',
            description: '外部サイトからのiframe埋め込みを無制限に許可するヘッダを追加する。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】それはクリックジャッキング攻撃を許してしまう逆効果な設定であり、管理画面のアクセス制限にもなりません。',
          },
        ],
      },
    ],
  },

  // ==========================================
  // 5. メール認証・フィッシング系 (dmz-2, D02)
  // ==========================================
  {
    match: ['漏洩した社員アドレスへのフィッシング', 'メール認証設定の不備'],
    category: 'メール認証不備・なりすまし (SPF / DKIM / DMARC & Phishing)',
    mitreId: 'T1566.002 (Spearphishing Link)',
    cweId: 'CWE-346 (Origin Validation Error)',
    scanTerminalLog:
      '[SCAN LOG] 25/tcp (SMTP) OPEN — ドメインのTXTレコードに `v=spf1 +all`（全送信元許可）が設定されており、DMARCポリシーが `p=none` です。送信元詐称メールがそのまま届きます。',
    whyDangerous:
      '送信ドメイン認証（SPF/DKIM/DMARC）に不備があると、外部の攻撃者が「社内システム管理者（admin@自社ドメイン）」になりすましたメールを社員へ送りつけ、認証情報を簡単にだまし取れてしまいます。',
    defenseMeasure:
      '【対策】SPFで正規メールサーバー以外を `-all`（拒否）にし、DKIM署名とDMARC（`p=quarantine` または `p=reject`）を有効化、さらにFIDO2等のフィッシング耐性MFAを導入します。',
    questions: [
      {
        id: 'mail-q1',
        questionType: 'TYPE B: 設定ファイル・ログ解析（弱点箇所の特定）',
        prompt: '対象組織のDNSに登録されているSPFレコードを確認したところ、決定的な設定ミスが見つかりました。どれが危険な記述ですか？',
        codeSnippet:
          'Record A: "v=spf1 ip4:198.51.100.10 -all"\nRecord B: "v=spf1 +all"\nRecord C: "v=DMARC1; p=reject;"',
        choices: [
          {
            id: 'mail_spf_ok',
            title: 'Record B: "v=spf1 +all"（世界中の全サーバーに送信を許可）',
            command: 'TXT: "v=spf1 +all"  -->  誰でもなりすまし放題の状態',
            description: '`+all` により、世界中のどのIPアドレスから送られた偽装メールでも「正規メール（PASS）」と判定されてしまう。',
            isCorrect: true,
            feedback: '【正解！】SPFレコードの `+all` は「世界中の誰が自社名を騙っても許可する」という致命的な設定ミスです。必ず正規IPのみ指定して末尾を `-all` または `~all` にします。',
          },
          {
            id: 'mail_spf_ng1',
            title: 'Record A: "v=spf1 ip4:198.51.100.10 -all"',
            command: 'TXT: "v=spf1 ip4:198.51.100.10 -all"',
            description: '指定したIPアドレスのみを許可し、それ以外をすべて拒否（-all）する設定。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】Record Aは最も安全で正しいSPF設定です。',
          },
          {
            id: 'mail_spf_ng2',
            title: 'Record C: "v=DMARC1; p=reject;"',
            command: 'TXT: "v=DMARC1; p=reject;"',
            description: '認証に失敗したなりすましメールを受信側で拒否（reject）させるDMARC設定。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】`p=reject` はなりすましメールを確実にブロックする強力な防御設定です。',
          },
        ],
      },
      {
        id: 'mail-q2',
        questionType: 'TYPE A: エクスプロイト選択（攻撃手法の特定）',
        prompt: 'メール認証設定（SPF/DMARC）の不備と漏洩アドレスを突いて初期認証トークンを獲得する手法を選んでください。',
        choices: [
          {
            id: 'mail_spoof',
            title: '送信元ドメイン詐称（SMTPスプーフィング）による認証回収',
            command: '> swaks --to user@corp.local --from security@corp.local --server target:25',
            description: 'SPF検証不備を突き、内部セキュリティ部門になりすました認証要求メールをSMTPサーバーへ直接注入する。',
            isCorrect: true,
            feedback: '【正解！】送信ドメイン認証の不備により、なりすましメールが正規通信として通過し、認証情報を獲得しました。',
          },
          {
            id: 'mail_sqli',
            title: 'SQLインジェクションによるDBテーブル削除',
            command: `> curl "https://target/?id=1; DROP TABLE users--"`,
            description: 'Webアプリケーション経由でデータベースのテーブルを削除する。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】SMTPメールサーバーに対してWeb用SQLインジェクションは通用せず、異常トラフィックとして検知されました。',
          },
          {
            id: 'mail_ddos',
            title: 'SYNフラッドによるサービス停止（DoS）攻撃',
            command: '> hping3 -S --flood -p 25 target',
            description: '大量の接続要求を送ってサーバーをダウンさせる。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】DoS攻撃はサーバーを停止させてしまい、情報が奪えないばかりか即座に警報が鳴り響きます！',
          },
        ],
      },
    ],
  },

  // ==========================================
  // 6. VPN・古い暗号・証明書管理系 (D03, C02, S2-I04, S2-C02)
  // ==========================================
  {
    match: ['古いVPN認証方式', '古い暗号認証設定', '証明書管理APIの保護不足', '認証ゲートの設定不備'],
    category: '暗号・証明書・VPN認証の不備 (Cryptographic Failures)',
    mitreId: 'T1588.004 (Digital Certificates) / T1556',
    cweId: 'CWE-326 (Inadequate Encryption Strength)',
    scanTerminalLog:
      '[SCAN LOG] 443/udp, 8443/tcp OPEN — レガシー認証（MS-CHAPv1 / TLS 1.0）へのフォールバック許可、およびクライアント証明書発行APIの認可不備を検出。',
    whyDangerous:
      '最新の暗号方式に対応していても「古い方式へのダウングレード（フォールバック）」が許可されていると、攻撃者にわざと弱い暗号方式を選ばれて通信や認証トークンを解読・偽造されてしまいます。',
    defenseMeasure:
      '【対策】古いプロトコル（TLS 1.0/1.1、弱いハッシュ関数）をサーバー側で完全に無効化し、証明書発行APIの相互TLS（mTLS）認証と失効確認（CRL/OCSP）を徹底します。',
    questions: [
      {
        id: 'vpn-q1',
        questionType: 'TYPE A: エクスプロイト選択（攻撃手法の特定）',
        prompt: '古い認証方式が残されたVPN／証明書認証ゲートを突破する攻撃手法を選んでください。',
        choices: [
          {
            id: 'vpn_downgrade',
            title: 'プロトコル・ダウングレード＆不正証明書トークン発行',
            command: '> tls-downgrade-exploit --target target:8443 --force-legacy-auth --issue-cert',
            description: '交渉時に旧式の脆弱な認証方式へフォールバックさせ、保護不足の証明書APIから有効な認証トークンを取得する。',
            isCorrect: true,
            feedback: '【正解！】レガシー認証へのダウングレードと証明書管理の不備を突いて認証ゲートを突破しました。古い暗号方式は「互換性のため」と残さず無効化すべきです。',
          },
          {
            id: 'vpn_dir',
            title: 'FTP匿名ログイン試行',
            command: '> ftp anonymous@target:21',
            description: '21番ポートのFTPサーバーへanonymousで接続する。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】VPN/暗号認証ゲートではFTP(21/tcp)は開いておらず、ポートスキャンとして検知されました。',
          },
          {
            id: 'vpn_xss',
            title: 'DOMベースXSSスクリプト注入',
            command: '> curl "https://target/#<img src=x onerror=alert(1)>"',
            description: 'ブラウザのDOM操作の不備を突いてスクリプトを実行する。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】VPN・証明書ゲートに対してブラウザ用XSSは無効です。',
          },
        ],
      },
      {
        id: 'vpn-q2',
        questionType: 'TYPE B: 設定ファイル・ログ解析（弱点箇所の特定）',
        prompt: '暗号認証サーバーの設定ファイルを確認しました。ダウングレード攻撃を許してしまっている危険な設定行はどれですか？',
        codeSnippet:
          'Line 1: ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3;\nLine 2: ssl_prefer_server_ciphers on;\nLine 3: ssl_session_timeout 10m;',
        choices: [
          {
            id: 'vpn_cfg_ok',
            title: 'Line 1: TLSv1 と TLSv1.1 が有効のまま残っている',
            command: '修正案: ssl_protocols TLSv1.2 TLSv1.3; （旧規格を無効化）',
            description: '既知の解読手法が存在する古いTLS 1.0 / 1.1を許可しているため、ダウングレード攻撃が成立してしまう。',
            isCorrect: true,
            feedback: '【正解！】`TLSv1` と `TLSv1.1` が残っていると、TLS 1.3に対応していても古い方式へ引きずり下ろされます。`TLSv1.2 TLSv1.3` のみに制限するのが正解です。',
          },
          {
            id: 'vpn_cfg_ng1',
            title: 'Line 2: ssl_prefer_server_ciphers on;',
            command: 'ssl_prefer_server_ciphers on;',
            description: 'クライアントではなくサーバー側が推奨する安全な暗号スイートを優先する設定。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】サーバー側の安全な暗号スイートを優先する設定は推奨される防御設定です。',
          },
          {
            id: 'vpn_cfg_ng2',
            title: 'Line 3: ssl_session_timeout 10m;',
            command: 'ssl_session_timeout 10m;',
            description: 'SSLセッションキャッシュの有効期限を10分にする設定。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】セッションタイムアウト10分は標準的な設定であり、脆弱性の原因ではありません。',
          },
        ],
      },
    ],
  },

  // ==========================================
  // 7. 資格情報・トークン保存不備系 (D05, I07)
  // ==========================================
  {
    match: ['認証情報の不適切な保存', '管理用資格情報の保存不備'],
    category: '資格情報（クレデンシャル）の平文保存・キャッシュ漏洩',
    mitreId: 'T1552.001 (Credentials in Files)',
    cweId: 'CWE-256 (Plaintext Storage of Password)',
    scanTerminalLog:
      '[SCAN LOG] LOCAL/ENV — `.env` ファイルおよび認証キャッシュDB内に、暗号化されていないAPIシークレットとNTLM/SHA1ハッシュが平文相当で残存しています。',
    whyDangerous:
      'ソースコードや設定ファイル（`.env` 等）、メモリキャッシュにパスワードや秘密鍵を平文で保存していると、1箇所が読まれただけで芋づる式に管理者アカウントや暗号鍵が奪われます。',
    defenseMeasure:
      '【対策】認証情報の平文保存・Gitコミットを厳禁とし、専用シークレット管理（Vault / KMS / HSM）と有効期限の短い一時トークンを使用します。',
    questions: [
      {
        id: 'cred-q1',
        questionType: 'TYPE A: エクスプロイト選択（攻撃手法の特定）',
        prompt: '不適切に保存されたキャッシュや設定ファイルから上位資格情報を奪取する手法を選んでください。',
        choices: [
          {
            id: 'cred_dump',
            title: '平文設定・認証キャッシュからのクレデンシャル抽出（Pass-the-Hash）',
            command: '> cred-harvest --scan-config /opt/app/.env --dump-auth-cache',
            description: '保護されていない設定ファイルとキャッシュメモリから認証トークン・鍵断片を抽出して再利用する。',
            isCorrect: true,
            feedback: '【正解！】平文で残されていた設定・キャッシュから資格情報を回収しました。秘密情報は必ずKMS/Vault等で暗号化管理する必要があります。',
          },
          {
            id: 'cred_dns',
            title: 'DNSキャッシュポイズニング攻撃',
            command: '> dnsspoof -i eth0 -f hosts.txt',
            description: '偽のDNS応答を送りつけて名前解決を改ざんする。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】対象は認証キャッシュ・管理端末であり、DNSポイズニングでは保存された資格情報は取り出せません。',
          },
          {
            id: 'cred_ping',
            title: 'Ping of Death（巨大ICMPパケット送信）',
            command: '> ping -s 65500 target',
            description: '規格外の大きなICMPパケットを送ってOSの異常終了を狙う。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】現代のOSには通用しない古いDoS攻撃であり、ファイアウォールに即座に検知されました。',
          },
        ],
      },
      {
        id: 'cred-q2',
        questionType: 'TYPE B: 設定ファイル・ログ解析（弱点箇所の特定）',
        prompt: '管理端末で見つかったスクリプトの抜粋です。セキュリティ上もっともやってはいけない「資格情報の管理ミス」はどれですか？',
        codeSnippet:
          'A: export DB_HOST="10.0.4.20"\nB: const ADMIN_SECRET = "NR-MASTER-KEY-9941-PLAIN"; // 直書き\nC: const TIMEOUT_MS = 5000;',
        choices: [
          {
            id: 'cred_code_b',
            title: 'B: ソースコード内に秘密鍵・パスワードをハードコード（直書き）している',
            command: 'NG: const ADMIN_SECRET = "NR-MASTER-KEY-..."',
            description: '秘密情報をコードや設定に平文で直書きすると、ファイルを閲覧された瞬間に全権限が漏洩する。',
            isCorrect: true,
            feedback: '【正解！】パスワードやAPIキーのハードコード（直書き）は重大な脆弱性（CWE-798）です。シークレット管理基盤から実行時に安全に注入すべきです。',
          },
          {
            id: 'cred_code_a',
            title: 'A: 接続先ホストのIPアドレスを環境変数に入れている',
            command: 'export DB_HOST="10.0.4.20"',
            description: '接続先サーバーのIPアドレスを環境変数で指定している。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】接続先ホスト名を環境変数で切り替えるのは12-Factor App等のベストプラクティスです。',
          },
          {
            id: 'cred_code_c',
            title: 'C: 通信タイムアウトを5000ミリ秒（5秒）に設定している',
            command: 'const TIMEOUT_MS = 5000;',
            description: 'タイムアウト値を定数で定義している。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】タイムアウトの定数定義は適切な実装であり、資格情報漏洩とは無関係です。',
          },
        ],
      },
    ],
  },

  // ==========================================
  // 8. 権限昇格・社内認証・開発環境・交換ハブ系 (internal-1, I01, I02, S2-I01, S2-I03)
  // ==========================================
  {
    match: [
      'Active Directoryの権限設定ミス',
      '認証権限の設定ミス',
      '開発用サービスの保護不足',
      '交換ハブの管理権限不備',
      '解析基盤のアクセス制御不備',
    ],
    category: '権限昇格・特権ID管理の不備 (Privilege Escalation / IAM Misconfig)',
    mitreId: 'T1068 (Privilege Escalation) / T1484',
    cweId: 'CWE-269 (Improper Privilege Management)',
    scanTerminalLog:
      '[SCAN LOG] 389/tcp (LDAP), 88/tcp (Kerberos), 9000/tcp (DevOps) — 一般ユーザーロール（USER）に対して、上位ロール（ADMIN/ROOT）のトークン発行・sudo実行が許可された権限設定ミスを検出。',
    whyDangerous:
      '社内認証（Active DirectoryやIAM）や開発用サーバーで「一般アカウントでも管理者権限のコマンドやトークン発行を実行できる」設定ミスがあると、侵入者に一気に最高権限（ADMIN/ROOT）まで昇格されてしまいます。',
    defenseMeasure:
      '【対策】ロールベースアクセス制御（RBAC）の見直し、特権アカウントの分離（Just-In-Time権限付与）、開発環境に本番の管理者権限を持たせない分離設計を行います。',
    questions: [
      {
        id: 'priv-q1',
        questionType: 'TYPE A: エクスプロイト選択（攻撃手法の特定）',
        prompt: '一般権限から管理者権限（ADMIN / ROOT）へ権限昇格するための有効な手法を選んでください。',
        choices: [
          {
            id: 'priv_esc',
            title: '過剰なACL/ロール権限を悪用した特権トークン発行（権限昇格）',
            command: '> iam-privesc --assume-role ADMIN --abuse-misconfigured-acl',
            description: '設定ミスにより一般権限に付与されていたロール引き受け権限を行使し、上位階層の管理者トークンを取得する。',
            isCorrect: true,
            feedback: '【正解！】ACL/ロールの設定ミスを突いて上位権限へ昇格しました。最小権限の原則と定期的な権限棚卸しが不可欠です。',
          },
          {
            id: 'priv_zip',
            title: 'Zip爆弾（圧縮ファイル展開によるディスク枯渇）',
            command: '> upload 42.zip --target /tmp',
            description: '展開すると数テラバイトになる圧縮ファイルを送り、ディスクを満杯にする。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】ディスクを溢れさせても管理者権限は手に入らず、システム監視アラートが即座に発報されました。',
          },
          {
            id: 'priv_css',
            title: 'CSSスタイルシート書き換えによる画面改ざん',
            command: '> inject-style "body { display: none; }"',
            description: 'Webページの見た目だけを変更する。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】画面の見た目を書き換えてもサーバー側の権限（ADMIN/ROOT）は一切昇格しません。',
          },
        ],
      },
      {
        id: 'priv-q2',
        questionType: 'TYPE B: 設定ファイル・ログ解析（弱点箇所の特定）',
        prompt: '開発サーバーの `/etc/sudoers` の設定を確認しました。一般ユーザー `devuser` に無制限のroot権限奪取を許してしまっている危険な行はどれですか？',
        codeSnippet:
          'Line A: Defaults env_reset\nLine B: devuser ALL=(ALL) NOPASSWD: ALL\nLine C: root ALL=(ALL:ALL) ALL',
        choices: [
          {
            id: 'priv_sudo_b',
            title: 'Line B: devuser ALL=(ALL) NOPASSWD: ALL',
            command: 'sudoers: devuser ALL=(ALL) NOPASSWD: ALL',
            description: '開発用アカウントがパスワード入力なし（NOPASSWD）であらゆるコマンドをroot権限で実行できる設定。',
            isCorrect: true,
            feedback: '【正解！】`NOPASSWD: ALL` を一般・開発アカウントに付与すると、そのアカウントが乗っ取られた瞬間にroot権限まで完全に奪われます。必要なコマンドのみに限定すべきです。',
          },
          {
            id: 'priv_sudo_a',
            title: 'Line A: Defaults env_reset',
            command: 'sudoers: Defaults env_reset',
            description: 'sudo実行時に危険な環境変数をリセットして安全にする設定。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】`env_reset` は環境変数を通じた権限昇格を防ぐための正しいセキュリティ設定です。',
          },
          {
            id: 'priv_sudo_c',
            title: 'Line C: root ALL=(ALL:ALL) ALL',
            command: 'sudoers: root ALL=(ALL:ALL) ALL',
            description: 'rootユーザー自身が全権限を持つというOS標準の定義。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】root自身が全権限を持つのは標準仕様です。問題は一般ユーザー `devuser` への過剰な権限付与です。',
          },
        ],
      },
    ],
  },

  // ==========================================
  // 9. 監視・ログ管理・プロキシ・痕跡削減系 (D06, D07, I03, I04, C04, S2-I05, S2-I07, S2-C04)
  // ==========================================
  {
    match: [
      'プロキシ設定の不備',
      '監視システムの設定不備',
      'ログ管理権限の不備',
      '監視制御APIの認証不備',
      '緊急制御機能の設定不備',
      '監査ログ管理の権限不備',
      '制御端末の認証不備',
      '迂回ゲートの管理設定不備',
    ],
    category: '監視・監査ログ基盤の保護不備 (Security Logging & Monitoring Failures)',
    mitreId: 'T1070.002 (Clear Event Logs) / T1562.001',
    cweId: 'CWE-778 (Insufficient Logging)',
    scanTerminalLog:
      '[SCAN LOG] 9200/tcp (SIEM/Log), 3128/tcp (Proxy) — 監視制御APIおよび監査ログストレージに削除・書き換え権限（DELETE/PUT）が開放されており、認証トークン検証が無効です。',
    whyDangerous:
      'どれほど優秀な監視AIやSIEMを導入していても、監視制御APIやログサーバー自体のアクセス制御が甘いと、攻撃者に「自分の侵入ログを消去」されたり「監視アラートを無効化」されてしまいます。',
    defenseMeasure:
      '【対策】監査ログは「追記専用（WORM：一度書いたら消せないストレージ）」で別セグメントに保管し、監視制御APIには相互認証と職務分掌（管理者でも単独でログを消せない仕組み）を適用します。',
    questions: [
      {
        id: 'log-q1',
        questionType: 'TYPE A: エクスプロイト選択（攻撃手法の特定）',
        prompt: '保護不備のある監視制御API・ログ管理基盤を操作して、侵入痕跡の削減（警戒度低下・監視解除）を行う手法を選んでください。',
        choices: [
          {
            id: 'log_tamper',
            title: '未認証の監視制御API操作＆監査ログローテーション改ざん',
            command: '> curl -X PATCH https://target:9200/api/monitor/policy -d \'{"suppress_alerts":true}\'',
            description: '認証が欠落した監視APIとログ書き込み権限を突き、アラート抑制および痕跡の削除を実行する。',
            isCorrect: true,
            feedback: '【正解！】監視・ログ基盤の認証不備を突いて警戒レベルを引き下げました。現実では「追記専用（WORM）ストレージへの即時ログ転送」が必須です。',
          },
          {
            id: 'log_ransom',
            title: '画面ロック型ランサムウェアの即時実行',
            command: '> encrypt-all --display-ransom-note',
            description: '画面に身代金要求を表示してシステムを破壊する。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】隠密に警戒度を下げるどころか、最も目立つ破壊行動を行ったため警戒度が上昇しました！',
          },
          {
            id: 'log_pop3',
            title: 'POP3メール受信ボックスの平文パスワード盗聴',
            command: '> tcpdump -i eth0 port 110',
            description: '110番ポートのメール受信通信を待ち受ける。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】対象は監視・プロキシ制御ノードであり、POP3メールの待ち受けは的外れです。',
          },
        ],
      },
      {
        id: 'log-q2',
        questionType: 'TYPE C: ペイロード＆防御コマンド解析（実践応用）',
        prompt: '【防衛側の視点】攻撃者にサーバーへ侵入された際でも「過去の監査ログを絶対に消去・改ざんさせない」ための正しいセキュリティ設計はどれですか？',
        choices: [
          {
            id: 'log_def_ok',
            title: '別ネットワークの追記専用（WORM）ログサーバーへリアルタイム転送する',
            command: 'rsyslog/fluentd -> WORM S3 Object Lock (Governance/Compliance Mode)',
            description: '万一対象サーバーのroot権限を奪われても、すでに別基盤へ送られたログは削除・上書きできないようにする。',
            isCorrect: true,
            feedback: '【正解！】ログを同じサーバー内だけに置くと、侵入者に真っ先に消されます。「別基盤への即時転送＋追記専用（WORM）ロック」が鉄則です！',
          },
          {
            id: 'log_def_ng1',
            title: 'ログファイルのファイル名を `.hidden_log` に変えて隠すだけにする',
            command: 'mv /var/log/auth.log /var/log/.hidden_log',
            description: '権限は変えず、ドットファイルにして見えにくくする（Security through Obscurity）。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】ファイル名を隠すだけ（Security through Obscurity）では、プロセス一覧や設定ファイルから数秒で見つかり消去されます。',
          },
          {
            id: 'log_def_ng2',
            title: 'ログが改ざんされないよう、最初からログ出力をすべて停止（OFF）にする',
            command: 'systemctl stop rsyslog && systemctl disable rsyslog',
            description: 'ログを一切記録しないように設定する。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】ログ出力を止めてしまったら、侵入された事実も被害範囲も永遠に調査できなくなります！',
          },
        ],
      },
    ],
  },

  // ==========================================
  // 10. ルーター・ファイアウォール・ゲートウェイ制御系 (I08, I09, C01, S2-I02, S2-C01)
  // ==========================================
  {
    match: [
      'ルーティング設定の不備',
      '防衛設定のアクセス制御不備',
      'ファイアウォール管理設定の不備',
      '内部ルーティング設定の不備',
      '転送ゲートの権限設定不備',
    ],
    category: 'ネットワーク境界・ファイアウォール設定不備 (Network Segmentation Failure)',
    mitreId: 'T1556.004 (Network Device Config Modification)',
    cweId: 'CWE-284 (Improper Access Control)',
    scanTerminalLog:
      '[SCAN LOG] 161/udp (SNMP), 443/tcp (FW-Mgmt) — ネットワーク機器の管理インターフェースがデータ用VLANと同じセグメントに露出しており、ルーティング・ACL書き換えが可能です。',
    whyDangerous:
      '内部ルーターやCoreファイアウォールの管理ポートが業務ネットワークからアクセスできる状態だと、攻撃者にファイアウォールルールを書き換えられ、最深部（Core層）への通信を全面開放されてしまいます。',
    defenseMeasure:
      '【対策】ネットワーク機器の管理インターフェースは専用の管理VLAN（Out-of-Band管理網）へ完全に隔離し、デフォルトのSNMPコミュニティ名（public/private）の廃止と設定変更の多段階承認を導入します。',
    questions: [
      {
        id: 'net-q1',
        questionType: 'TYPE A: エクスプロイト選択（攻撃手法の特定）',
        prompt: '露出しているルーター／ファイアウォール管理機構を突き、Core領域への通信ルートを開放する手法を選んでください。',
        choices: [
          {
            id: 'net_route',
            title: '管理プレーンAPI／SNMP RW権限を突いたACL・ルート書き換え',
            command: '> fw-mgmt-cli --target target --add-rule "ALLOW ALL -> CORE_SUBNET"',
            description: 'セグメント分離されていない管理インターフェースへ接続し、Core層への遮断ルールをバイパスする。',
            isCorrect: true,
            feedback: '【正解！】管理プレーンの露出を突き、Core領域へのパケットフィルタを開放しました。管理ポートは専用VLAN（Out-of-Band）へ分離すべきです。',
          },
          {
            id: 'net_cookie',
            title: 'ブラウザのCookie属性（SameSite）の書き換え',
            command: '> document.cookie = "session=1; SameSite=None"',
            description: 'クライアント側ブラウザのCookie設定を変更する。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】コアルーターやファイアウォールのパケットフィルタはブラウザのCookieでは突破できません。',
          },
          {
            id: 'net_audio',
            title: '音声コーデック変換ドライバのファジング',
            command: '> fuzz-audio --input sample.wav',
            description: 'メディア再生ソフトに壊れた音声ファイルを入力する。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】ネットワーク機器に音声ドライバ攻撃は全く無関係であり、異常通信として検知されました。',
          },
        ],
      },
      {
        id: 'net-q2',
        questionType: 'TYPE B: 設定ファイル・ログ解析（弱点箇所の特定）',
        prompt: 'Coreファイアウォールのルール一覧（上から順に評価）を確認しました。本来遮断されるべき攻撃通信が素通りしてしまう原因はどのルールですか？',
        codeSnippet:
          'Rule 1: ALLOW src=ANY dst=CORE_NET port=ALL  (テスト用ルール)\nRule 2: ALLOW src=ADMIN_VLAN dst=CORE_NET port=443\nRule 3: DENY  src=ANY dst=CORE_NET port=ALL',
        choices: [
          {
            id: 'net_fw_r1',
            title: 'Rule 1: 最上位に「ALLOW src=ANY（全許可）」のテスト用ルールが残っている',
            command: 'Rule 1: ALLOW src=ANY dst=CORE_NET port=ALL  -->  削除すべき',
            description: 'ファイアウォールは上から順に評価（First Match）されるため、1番上に全許可があると下のRule 3（DENY）が一切機能しなくなる。',
            isCorrect: true,
            feedback: '【正解！】ファイアウォールは「上から順に評価（最初に一致したルールを適用）」します。テスト用の全許可ルールが1行目に残っていると、後ろのDENYルールはすべて無効化されてしまいます！',
          },
          {
            id: 'net_fw_r2',
            title: 'Rule 2: 管理VLANから443番ポート（HTTPS）のみを許可している行',
            command: 'Rule 2: ALLOW src=ADMIN_VLAN dst=CORE_NET port=443',
            description: '特定の管理サブネットから暗号化ポートのみを許可するルール。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】Rule 2は送信元とポートを最小限に絞った適切なルールです。',
          },
          {
            id: 'net_fw_r3',
            title: 'Rule 3: 最下部の暗黙の拒否（DENY ALL）ルール',
            command: 'Rule 3: DENY src=ANY dst=CORE_NET port=ALL',
            description: '最後に許可リスト以外の通信をすべて遮断するルール。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】末尾にDENY ALLを置くこと自体は正しい設計ですが、Rule 1が先にあるせいでここまで処理が到達していません。',
          },
        ],
      },
    ],
  },

  // ==========================================
  // 11. 機密DB・SQLインジェクション・最終目標DB系 (core-1, C03, S2-C03)
  // ==========================================
  {
    match: ['SQLインジェクション', 'データベース権限設定の不備', '証跡DBの権限設定不備'],
    category: 'データベース脆弱性・SQLインジェクション／過剰DB権限',
    mitreId: 'T1190 (Exploit Public-Facing Application)',
    cweId: 'CWE-89 (SQL Injection)',
    scanTerminalLog:
      '[SCAN LOG] 5432/tcp (PostgreSQL) OPEN — 検索パラメータの文字列連結によるSQLインジェクション脆弱性、およびアプリ用接続ロールに `SUPERUSER / BYPASSRLS` 権限が付与されています。',
    whyDangerous:
      'SQL文を文字列連結で組み立てていると「SQLインジェクション」で認証回避や全テーブル抽出が可能になります。さらにDB接続アカウントの権限が強すぎると、本来の業務範囲を超えた極秘テーブルまで一括回収されてしまいます。',
    defenseMeasure:
      '【対策】SQL実行には必ず「プリペアドステートメント（プレースホルダ）」を使用し、DBアカウントの権限最小化（Row Level Securityの適用、SUPERUSER禁止）を行います。',
    questions: [
      {
        id: 'db-q1',
        questionType: 'TYPE A: エクスプロイト選択（攻撃手法の特定）',
        prompt: '最終目標データベースのSQLインジェクション／過剰権限の不備を突いて機密レコードへのアクセスを確立する手法を選んでください。',
        choices: [
          {
            id: 'db_sqli_union',
            title: 'UNIONベースSQLインジェクション＆特権DBロールによる機密テーブル抽出',
            command: `> db-exploit --target target:5432 --query "' UNION SELECT id, secret_blob FROM classified_records--"`,
            description: 'エスケープされていない検索条件にUNION SELECT句を注入し、過剰なDBロール権限を使って機密テーブルへ到達する。',
            isCorrect: true,
            feedback: '【正解！】SQLインジェクションとDBロールの過剰権限を突き、機密データベースのロックを突破しました！',
          },
          {
            id: 'db_wifi',
            title: 'WPA2 Wi-Fiハンドシェイク傍受（無線LAN解析）',
            command: '> aircrack-ng -w wordlist.txt capture.cap',
            description: '無線LANの電波を傍受してWi-Fiパスワードを解析する。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】データセンター深部の機密データベースに対して無線LAN解析ツールは無意味であり、不審プロセスとして検知されました。',
          },
          {
            id: 'db_dns',
            title: 'WHOISドメイン登録者情報の検索',
            command: '> whois example.com',
            description: '公開されているドメインの登録者名を調べる。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】WHOIS検索では内部データベースの機密テーブルには侵入できません。',
          },
        ],
      },
      {
        id: 'db-q2',
        questionType: 'TYPE B: 設定ファイル・ログ解析（弱点箇所の特定）',
        prompt: 'データベース接続コードの比較です。SQLインジェクションを許してしまう「脆弱なコード」はどれですか？',
        codeSnippet:
          'Code A: db.query(`SELECT * FROM records WHERE id = \'${userInput}\'`);\nCode B: db.query("SELECT * FROM records WHERE id = $1", [userInput]);\nCode C: GRANT SELECT ON public_summary TO app_readonly;',
        choices: [
          {
            id: 'db_code_a',
            title: 'Code A: テンプレート文字列で `userInput` を直接SQL文に連結している',
            command: 'NG: `SELECT * FROM records WHERE id = \'${userInput}\'`',
            description: '入力値に `\' OR \'1\'=\'1` などが含まれるとSQLの構造そのものが書き換わってしまう（SQLインジェクション）。',
            isCorrect: true,
            feedback: '【正解！】文字列連結（Code A）がSQLインジェクションの原因です。必ずCode Bのようにプレースホルダ（`$1` や `?`）を使ったプリペアドステートメントにします。',
          },
          {
            id: 'db_code_b',
            title: 'Code B: プレースホルダ（$1）とパラメータ配列を分離して渡している',
            command: 'OK: db.query("SELECT * FROM records WHERE id = $1", [userInput])',
            description: 'プリペアドステートメントにより、入力値がSQL命令ではなく単なる「データ（値）」として安全に処理される。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】Code BはSQLインジェクションを根本的に防ぐ正しい実装（プリペアドステートメント）です！',
          },
          {
            id: 'db_code_c',
            title: 'Code C: 読み取り専用ロールに公開テーブルのSELECT権限のみを付与している',
            command: 'OK: GRANT SELECT ON public_summary TO app_readonly;',
            description: '最小権限の原則に従って必要なテーブルの参照のみを許可している。',
            isCorrect: false,
            feedback: '【不正解・IDS検知！】Code Cはデータベース権限を最小化する正しい防御設定です。',
          },
        ],
      },
    ],
  },
];

export function getSecurityChallenge(
  nodeId: string,
  vulnerability: string | null | undefined,
  nodeInfo?: string | null,
): SecurityChallenge {
  const vulnText = (vulnerability ?? '').trim();

  const found = CHALLENGE_GROUPS.find((def) =>
    def.match.some((keyword) => vulnText.includes(keyword)),
  );

  if (found) {
    const questions: ChallengeQuestion[] = found.questions.map((q, qIdx) => ({
      id: q.id,
      questionType: q.questionType,
      prompt: q.prompt,
      codeSnippet: q.codeSnippet,
      choices: rotateChoices(q.choices, `${nodeId}-${qIdx}`),
    }));

    // ノードIDによって最初に出る問題の順番も変える（ステージ内でTYPE AとTYPE B/Cがバランスよく出る）
    const startIdx = nodeId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % questions.length;
    const orderedQuestions = [...questions.slice(startIdx), ...questions.slice(0, startIdx)];

    return {
      category: found.category,
      mitreId: found.mitreId,
      cweId: found.cweId,
      scanTerminalLog: found.scanTerminalLog,
      whyDangerous: found.whyDangerous,
      defenseMeasure: found.defenseMeasure,
      questions: orderedQuestions,
      choices: orderedQuestions[0].choices,
    };
  }

  // 万一未知の脆弱性文字列が追加された場合の汎用チャレンジ
  const fallbackChoices = rotateChoices(
    [
      {
        id: 'fallback_ok',
        title: '設定不備・アクセス制御バイパス攻撃',
        command: `> exploit/config_bypass --target ${nodeId} --vuln "${vulnText || 'misconfig'}"`,
        description: `検出された「${vulnText || '設定・アクセス制御の不備'}」を突き、保護されていない管理経路から権限を取得する。`,
        isCorrect: true,
        feedback: `【正解！】「${vulnText || '設定不備'}」を突いて制御を奪取しました。管理インターフェースのアクセス制限と設定監査が重要です。`,
      },
      {
        id: 'fallback_ng1',
        title: 'SQLインジェクション攻撃',
        command: `> sqlmap -u "https://target/query?id=1" --payload "' OR 1=1 --"`,
        description: 'Webフォームに不正なSQL文を注入する。',
        isCorrect: false,
        feedback: '【不正解・IDS検知！】対象ノードの脆弱性と一致しない攻撃を行ったため、IDSに検知されました。',
      },
      {
        id: 'fallback_ng2',
        title: '標的型スピアフィッシング送信',
        command: '> sendmail --spoof admin@corp.local --attach macro.docm',
        description: '偽装メールを送りつけて添付ファイルを開かせる。',
        isCorrect: false,
        feedback: '【不正解・IDS検知！】このノードの技術的脆弱性にはフィッシングは通用しません。',
      },
    ],
    nodeId,
  );

  const fallbackQuestion: ChallengeQuestion = {
    id: `${nodeId}-q1`,
    questionType: 'TYPE A: エクスプロイト選択（攻撃手法の特定）',
    prompt: `検出された「${vulnText || '設定不備'}」に対して有効な攻撃手法を選択してください。`,
    choices: fallbackChoices,
  };

  return {
    category: 'アクセス制御・構成設定の不備（Security Misconfiguration）',
    mitreId: 'T1068 (Privilege Escalation) / T1190',
    cweId: 'CWE-16 (Configuration)',
    scanTerminalLog: `[SCAN LOG] NODE ${nodeId} — 「${vulnText || '設定不備'}」を検出。${nodeInfo ? `補足情報: ${nodeInfo}` : ''}`,
    whyDangerous: `サーバーやネットワーク機器の「${vulnText || '設定不備'}」を放置すると、本来許可されていない経路から管理機能を操作され、内部深部への踏み台にされます。`,
    defenseMeasure: '【対策】管理画面や制御ポートへのアクセス元IP制限、デフォルト設定の見直し、最小権限の原則に基づいた構成管理を実施します。',
    questions: [fallbackQuestion],
    choices: fallbackChoices,
  };
}
