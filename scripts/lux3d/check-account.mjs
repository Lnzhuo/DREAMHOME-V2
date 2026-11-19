import { createLux3dClient } from '@manycore/aholo-sdk-lux3d';
import { loadServerEnv } from '../../server/env.mjs';

await loadServerEnv();
if (!process.env.AHOLO_API_KEY) {
  console.error('服务端尚未配置 AHOLO_API_KEY。请在本机 .env 中设置，不要发送到聊天。');
  process.exit(2);
}

try {
  const client = createLux3dClient({ region: process.env.AHOLO_REGION || 'cn', apiKey: process.env.AHOLO_API_KEY });
  const history = await client.tasks.list({ page: 1, pageSize: 1 });
  console.log(JSON.stringify({ authenticated: true, region: process.env.AHOLO_REGION || 'cn', taskHistoryRead: true, taskCostFieldAvailable: (history.items || []).some(item => typeof item.consumedCredits === 'number'), balance: 'unknown_use_account_console', freeTrials: 'unknown_use_account_console', pricing: 'unknown_use_account_console' }, null, 2));
} catch (error) {
  console.error(`只读鉴权或任务历史检查失败：${error.message}`);
  process.exit(1);
}
