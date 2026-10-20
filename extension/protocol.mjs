const versions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function rpc(request, server = {}) {
  const validId = object(request) && (typeof request.id === 'string' ||
    (typeof request.id === 'number' && Number.isFinite(request.id)));
  const id = validId ? request.id : null;
  const error = (code, message) => ({jsonrpc: '2.0', id, error: {code, message}});
  const result = value => ({jsonrpc: '2.0', id, result: value});
  if (!object(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string' ||
      ('id' in request && !validId) || ('params' in request && !object(request.params))) {
    return error(-32600, 'Invalid request');
  }
  if (!('id' in request)) return null;
  const params = request.params ?? {};
  if (request.method === 'initialize') {
    if (typeof params.protocolVersion !== 'string' || !object(params.capabilities) || !object(params.clientInfo)) {
      return error(-32602, 'Invalid initialize parameters');
    }
    return result({
      protocolVersion: versions.includes(params.protocolVersion) ? params.protocolVersion : versions[0],
      capabilities: {tools: {listChanged: false}, ...(server.resources?.length ? {resources: {}} : {})},
      serverInfo: {name: server.name ?? 'chat-commander', version: server.version ?? '0.9.0'},
      instructions: server.instructions ?? '',
    });
  }
  if (request.method === 'ping') return result({});
  if (request.method === 'tools/list') {
    if (params.cursor !== undefined) return error(-32602, 'Pagination is not supported');
    return result({tools: server.tools ?? []});
  }
  if (server.resources?.length && request.method === 'resources/list') {
    if (params.cursor !== undefined) return error(-32602, 'Resource pagination unsupported');
    return result({resources: server.resources});
  }
  if (server.resources?.length && request.method === 'resources/read') {
    const resource = server.readResource(params.uri);
    return resource ? result(resource) : error(-32602, 'Unknown resource');
  }
  if (request.method !== 'tools/call') return error(-32601, 'Method not found');
  if (!server.tools?.some(tool => tool.name === params.name)) return error(-32602, 'Unknown tool');
  if (!server.validToolArgs(params.name, params.arguments)) return error(-32602, 'Invalid tool arguments');
  // Tool execution belongs to the dispatcher; the protocol only validates the frame.
  return result({});
}

export function envelope(command, server = {}) {
  if (!object(command) || typeof command.request_id !== 'string' || !command.request_id ||
      typeof command.shard_token !== 'string' || !/^[\x21-\x7e]+$/.test(command.shard_token) ||
      (command.channel !== undefined && typeof command.channel !== 'string')) throw new Error('invalid_command');
  const base = {request_id: command.request_id, channel: command.channel ?? 'main'};
  if (command.command_type === 'session_termination') {
    return {...base, resp_type: 'session_termination_response', resp_code: 204};
  }
  if (command.command_type !== 'jsonrpc') return null;
  const response = rpc(command.jsonrpc, server);
  if (response === null) return {...base, resp_type: 'notify_ack', resp_code: 202};
  return {...base, resp_type: 'jsonrpc_response', resp_code: 200,
    resp_headers: {'Content-Type': ['application/json']}, resp_json: response};
}
