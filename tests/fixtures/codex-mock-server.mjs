// Minimal fake OpenAI Responses endpoint. First request: ask Codex to run one
// shell command. Follow-up request: finish. Lets the suite prove Codex runs a
// shell command without any login.
import http from 'node:http';
import { writeFileSync } from 'node:fs';

const sse = (res, events) => {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  for (const e of events) res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  res.end();
};
const usage = { input_tokens: 1, input_tokens_details: null, output_tokens: 1, output_tokens_details: null, total_tokens: 2 };
const command = process.argv[2];
const dump = process.argv[3]; // optional: write the first request body here

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (dump && !body.includes('function_call_output')) writeFileSync(dump, body);
    if (!body.includes('function_call_output')) {
      sse(res, [
        { type: 'response.created', response: { id: 'r1' } },
        { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'c1', name: 'exec_command', arguments: JSON.stringify({ cmd: command }) } },
        { type: 'response.completed', response: { id: 'r1', usage } },
      ]);
    } else {
      sse(res, [
        { type: 'response.created', response: { id: 'r2' } },
        { type: 'response.output_item.done', item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'done' }] } },
        { type: 'response.completed', response: { id: 'r2', usage } },
      ]);
    }
  });
}).listen(18080, '127.0.0.1');
