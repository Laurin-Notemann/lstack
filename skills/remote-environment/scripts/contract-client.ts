import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Schedule from 'effect/Schedule';
import * as Scope from 'effect/Scope';
import * as Exit from 'effect/Exit';
import * as Stream from 'effect/Stream';
import * as Socket from 'effect/socket/Socket';
import { RpcClient, RpcSerialization } from 'effect/rpc';
import { WsRpcGroup } from '@otterware-contracts/rpc.ts';
export * as RelaySchemas from '@otterware-contracts/relay.ts';
export { ExecutionEnvironmentDescriptor } from '@otterware-contracts/environment.ts';
export { OtterAccountUser } from '@otterware-contracts/accounts.ts';
export { AuthAccessTokenResult, AuthWebSocketTicketResult } from '@otterware-contracts/auth.ts';
export { decodeUnknownSync, toCodecJson } from 'effect/Schema';

const group = WsRpcGroup;

export async function withRpc<T>(url: string, use: (api: Awaited<ReturnType<typeof connect>>) => Promise<T>): Promise<T> {
  const scope = await Effect.runPromise(Scope.make());
  try { return await use(await connect(url, scope)); }
  finally { await Effect.runPromise(Scope.close(scope, Exit.void)); }
}
async function connect(url: string, scope: Scope.Scope) {
  const protocol = Layer.effect(RpcClient.Protocol, RpcClient.makeProtocolSocket({
    retryTransientErrors: false, retryPolicy: Schedule.recurs(0), pingTimeout: '15 seconds',
  })).pipe(Layer.provide(Layer.mergeAll(
    Socket.layerWebSocket(url, { openTimeout: '15 seconds' }).pipe(Layer.provide(Socket.layerWebSocketConstructorGlobal)),
    RpcSerialization.layerJson,
  )));
  const context = await Effect.runPromise(Layer.build(protocol).pipe(Effect.provideService(Scope.Scope, scope)));
  const client = await Effect.runPromise(RpcClient.make(group).pipe(Effect.provide(context), Effect.provideService(Scope.Scope, scope)));
  return {
    browse: (input: Parameters<typeof client['filesystem.browse']>[0]) => Effect.runPromise(client['filesystem.browse'](input).pipe(Effect.timeout('20 seconds'))),
    stat: (input: Parameters<typeof client['filesystem.getMetadata']>[0]) => Effect.runPromise(client['filesystem.getMetadata'](input).pipe(Effect.timeout('20 seconds'))),
    read: (input: Parameters<typeof client['projects.readFile']>[0]) => Effect.runPromise(client['projects.readFile'](input).pipe(Effect.timeout('20 seconds'))),
    write: (input: Parameters<typeof client['projects.writeFile']>[0]) => Effect.runPromise(client['projects.writeFile'](input).pipe(Effect.timeout('20 seconds'))),
    open: (input: Parameters<typeof client['terminal.open']>[0]) => Effect.runPromise(client['terminal.open'](input).pipe(Effect.timeout('20 seconds'))),
    send: (input: Parameters<typeof client['terminal.write']>[0]) => Effect.runPromise(client['terminal.write'](input).pipe(Effect.timeout('20 seconds'))),
    close: (input: Parameters<typeof client['terminal.close']>[0]) => Effect.runPromise(client['terminal.close'](input).pipe(Effect.timeout('20 seconds'))),
    observe(input: Parameters<typeof client['terminal.observe']>[0], onEvent: (event: Stream.Success<ReturnType<typeof client['terminal.observe']>>) => void) {
      const controller = new AbortController();
      const done = Effect.runPromise(client['terminal.observe'](input).pipe(Stream.runForEach(event => Effect.sync(() => onEvent(event)))), { signal: controller.signal });
      // A handler is attached immediately; callers still receive the original rejection.
      void done.catch(() => {});
      return { done, cancel: () => controller.abort() };
    },
  };
}
export type RemoteApi = Awaited<ReturnType<typeof connect>>;
