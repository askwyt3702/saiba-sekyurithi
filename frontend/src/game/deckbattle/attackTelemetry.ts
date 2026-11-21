// カード使用時に「実際にどんな攻撃・防御をしているか」を初心者にも直感的に伝えるテレメトリ定義。
// リアルな1行コマンド演出 + セキュリティ分類タグを全40種に対応づける。
import { CARD_DEFINITIONS } from './cards';

export interface CardTelemetry {
  /** セキュリティ分野の短い分類タグ */
  tag: string;
  /** ターミナル風に実行される模擬コマンド・ペイロード */
  command: string;
}

export const CARD_TELEMETRY: Record<string, CardTelemetry> = {
  ssh_brute: { tag: '認証突破', command: 'hydra -l root -P passwords.txt ssh://target' },
  firewall: { tag: '通信遮断', command: 'ufw default deny incoming && ufw enable' },
  ddos: { tag: '帯域飽和', command: 'hping3 --flood --syn -p 443 target' },
  port_scan: { tag: '事前偵察', command: 'nmap -sS -T4 --open target' },
  session_hijack: { tag: '権限乗っ取り', command: 'curl -H "Cookie: SID=stolen_token" target/admin' },
  script_auto: { tag: '攻撃自動化', command: 'python3 exploit_pipeline.py --auto' },
  sql_injection: { tag: '入力不備', command: "POST /login  id=\"admin' OR '1'='1' --\"" },
  waf_rule: { tag: 'Web防御', command: 'wafctl --enable-sqli-filter --enable-xss-filter' },
  arp_spoof: { tag: '経路乗っ取り', command: 'arpspoof -i eth0 -t target gateway' },
  honeypot: { tag: 'おとり罠', command: 'cowrie-honeypot --bind 0.0.0.0:22 --trap' },
  zero_day: { tag: '未知の脆弱性', command: 'exploit --cve=ZERO-DAY --bypass-all-fw' },
  backdoor: { tag: '永続侵入', command: 'crontab -e "@reboot /usr/bin/.hidden_beacon"' },
  ping_sweep: { tag: 'ホスト探索', command: 'fping -a -g 10.0.0.0/24' },
  syn_ack_shield: { tag: 'DoS耐性', command: 'sysctl -w net.ipv4.tcp_syncookies=1' },
  xss_reflect: { tag: 'スクリプト注入', command: 'GET /search?q=<script>reflect(payload)</script>' },
  path_traversal: { tag: '階層突破', command: 'GET /download?file=../../../../etc/passwd' },
  log_tamper: { tag: '痕跡消去', command: 'shred -u /var/log/auth.log && history -c' },
  packet_sniff: { tag: '通信傍受', command: 'tcpdump -i eth0 -A "port 80 or port 21"' },
  cmd_inject: { tag: 'OS命令注入', command: 'POST /ping  host="127.0.0.1; cat /etc/shadow"' },
  csrf_forge: { tag: '偽装リクエスト', command: 'POST /fw/transfer (forged admin session)' },
  tls_shield: { tag: '暗号化通信', command: 'nginx --ssl-protocols TLSv1.3 --strict' },
  thermal_spike: { tag: 'リソース過負荷', command: 'stress-ng --cpu 16 --fork-bomb target' },
  rate_limit: { tag: '通信制限', command: 'nginx --limit-req zone=api burst=5 nodelay' },
  fuzz_probe: { tag: '異常値連打', command: 'ffuf -u https://target/FUZZ -w fuzz.txt -t 64' },
  dns_spoof: { tag: '名前解決改ざん', command: 'dnsspoof -i eth0 target.internal -> 10.6.6.6' },
  sandbox_guard: { tag: '検体隔離', command: 'sandboxctl --quarantine-noise --purge' },
  shield_slam: { tag: '防壁反撃', command: 'fw-counter --discharge-shield-energy' },
  burn_detonate: { tag: '過熱起爆', command: 'thermal-ctl --trigger-overload --now' },
  packet_burst: { tag: '一斉送信', command: 'netburst --flush-hand-packets --parallel' },
  overvolt: { tag: '限界突破', command: 'busctl --overvolt --disable-limiter' },
  ransom_lock: { tag: '暗号化拘束', command: 'ransom-enc --aes256 --lock /srv/core' },
  fortress_double: { tag: '冗長防壁', command: 'cluster-fw --mirror-active-active --x2' },
  privilege_reset: { tag: '特権失効', command: 'iamctl --revoke-all-tokens --reset-buff' },
  ssrf_tunnel: { tag: '内部網侵入', command: 'POST /fetch  url="http://169.254.169.254/meta"' },
  kernel_panic: { tag: '中枢破壊', command: 'echo c > /proc/sysrq-trigger # Ring0' },
  botnet_swarm: { tag: 'ボット斉射', command: 'c2-swarm --nodes=4096 --volleys=3 target' },
  quantum_decrypt: { tag: '暗号解読', command: 'qshor --factor-rsa-2048 --steal-keys' },
  supply_chain: { tag: '更新汚染', command: 'pkg-publish --inject-backdoor core-lib@latest' },
  aegis_core: { tag: '絶対防衛', command: 'aegis-matrix --deploy-quantum-fw --x2' },
  ai_fuzzer: { tag: 'AI自動探索', command: 'ai-fuzzer --synth-exploit --realtime' },
  noise: { tag: '妨害通信', command: 'ERR_CORRUPT_PACKET // 0xDEAD_NOISE' },
};

export function getCardTelemetry(defId: string): CardTelemetry {
  const found = CARD_TELEMETRY[defId];
  if (found) return found;
  const def = CARD_DEFINITIONS[defId];
  if (def?.kind === 'defense') return { tag: '防御対策', command: `defend --card ${defId}` };
  if (def?.kind === 'utility') return { tag: '解析支援', command: `analyze --card ${defId}` };
  return { tag: '脆弱性攻撃', command: `exploit --card ${defId}` };
}
