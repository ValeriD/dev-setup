// Minimal fake Anthropic Messages endpoint. The first main-loop request asks Claude Code to call one
// tool; the follow-up records that tool's result to a file and ends the turn. Lets the suite check
// Claude's real permission decisions without any login or model.
// Written against Claude Code 2.1.310 (the image pin) and checked with 2.1.325; a Claude update can change
// the request shape or the refusal wording without any policy change.
// Usage: node claude-mock-server.mjs <port> <result file> <tool name> <tool input JSON> <ready file>
import { createServer } from 'node:http';
import { appendFileSync, writeFileSync } from 'node:fs';
const [port, resultFile, tool, input, readyFile] = process.argv.slice(2);
const send = (res, body, content, stop) => {
  const msg = { id: 'msg_fake', type: 'message', role: 'assistant', model: body.model, content, stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
  if (!body.stream) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(msg)); }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const event = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  event('message_start', { message: { ...msg, content: [], stop_reason: null } });
  content.forEach((c, index) => {
    if (c.type === 'text') {
      event('content_block_start', { index, content_block: { type: 'text', text: '' } });
      event('content_block_delta', { index, delta: { type: 'text_delta', text: c.text } });
    } else {
      event('content_block_start', { index, content_block: { ...c, input: {} } });
      event('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(c.input) } });
    }
    event('content_block_stop', { index });
  });
  event('message_delta', { delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 1 } });
  event('message_stop', {});
  res.end();
};
createServer((req, res) => {
  let raw = '';
  req.on('data', d => (raw += d));
  req.on('end', () => {
    if (!req.url.startsWith('/v1/messages') || req.url.includes('count_tokens')) { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"input_tokens":1}'); }
    const body = JSON.parse(raw || '{}');
    const results = (body.messages ?? []).flatMap(m => Array.isArray(m.content) ? m.content : []).filter(c => c.type === 'tool_result');
    const mainLoop = (body.tools ?? []).some(t => t.name === tool);
    if (!mainLoop) return send(res, body, [{ type: 'text', text: 'ok' }], 'end_turn');
    if (results.length) {
      appendFileSync(resultFile, JSON.stringify(results.at(-1)) + '\n');
      return send(res, body, [{ type: 'text', text: 'done' }], 'end_turn');
    }
    send(res, body, [{ type: 'tool_use', id: 'toolu_fake1', name: tool, input: JSON.parse(input) }], 'tool_use');
  });
}).listen(Number(port), '127.0.0.1', () => writeFileSync(readyFile, ''));
