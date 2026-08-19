import type { Awaitable } from "@danielsharp/common";
import type { TypeAtPath, NarrowTypeAtPath, PathBuilder } from "./branch";
import { typeline, type Middleware, type Pushable, type Typeline, type TypelineBuilder } from "./pipeline";
import { DispatcherNoMatchError } from "./errors";

export interface PredicateDispatcher<TInitial, TCurrent, TContext, TMeta>
  extends Pushable<TInitial, unknown, TContext> {
  use<TNext = TCurrent>(
    mw: Middleware<TCurrent, TNext, TContext, TMeta> | Typeline<TCurrent, TNext, TContext, TMeta>,
  ): PredicateDispatcher<TInitial, TNext, TContext, TMeta>;
  on<TNarrowed extends TContext>(
    predicate: (input: TContext) => input is TNarrowed,
    builder: TypelineBuilder<TCurrent, any, TNarrowed, TMeta>,
  ): PredicateDispatcher<TInitial, TCurrent, TContext, TMeta>;
}

export function predicateDispatcher<TInput, TContext, TMeta>(): PredicateDispatcher<TInput, TInput, TContext, TMeta> {
  const resolver = predicateResolver<TContext, TMeta>();

  return dispatcher<TContext, TMeta>({
    resolver,
    lines: [typeline()],
  }) as PredicateDispatcher<TInput, TInput, TContext, TMeta>;
}

export interface MapDispatcher<TInitial, TCurrent, TContext, TMeta, TPath extends readonly PropertyKey[]>
  extends Pushable<TInitial, unknown, TContext> {
  use<TNext = TCurrent>(
    mw: Middleware<TCurrent, TNext, TContext, TMeta> | Typeline<TCurrent, TNext, TContext, TMeta>,
  ): MapDispatcher<TInitial, TNext, TContext, TMeta, TPath>;
  on<TNarrowed extends TypeAtPath<TContext, TPath>>(
    key: TNarrowed,
    builder: TypelineBuilder<TCurrent, any, NoInfer<NarrowTypeAtPath<TContext, TPath, TNarrowed>>, TMeta>,
  ): MapDispatcher<TInitial, TCurrent, TContext, TMeta, TPath>;
}

export function mapDispatcher<TInput, TContext, TMeta, const TPath extends readonly PropertyKey[]>(
  pathSelector: (path: PathBuilder<TContext>) => TPath,
): MapDispatcher<TInput, TInput, TContext, TMeta, TPath> {
  const resolver = mapResolver<TContext, TMeta>(pathSelector as (context: TContext) => unknown);

  return dispatcher<TContext, TMeta>({
    resolver,
    lines: [typeline()],
  }) as MapDispatcher<TInput, TInput, TContext, TMeta, TPath>;
}

export interface DispatcherState<TContext, TMeta> {
  readonly onError?: (error: unknown, input: unknown, context: TContext) => Awaitable<any>;
  readonly resolver: Resolver<TContext, TMeta>;
  readonly lines: Typeline<any, any, TContext, TMeta>[];
}

export interface Dispatcher<TContext, TMeta> extends Pushable<any, any, TContext> {
  use(mw: Middleware<any, any, TContext, TMeta> | Typeline<any, any, TContext, TMeta>): Dispatcher<TContext, TMeta>;
  on(match: any, builder: TypelineBuilder<any, any, TContext, TMeta>): Dispatcher<TContext, TMeta>;
}

export function dispatcher<TContext, TMeta>(state: DispatcherState<TContext, TMeta>): Dispatcher<TContext, TMeta> {
  return {
    push: async (input: unknown, context: TContext) => {
      const line = state.resolver.resolve(context);
      return line.push(input, context);
    },
    use(mw: any) {
      const currentLine = state.lines[state.lines.length - 1]!;
      return dispatcher({
        ...state,
        lines: [...state.lines, currentLine.pipe(mw)],
      });
    },
    on(match: any, builder: TypelineBuilder<any, any, any, TMeta>) {
      const currentLine = state.lines[state.lines.length - 1]!;
      const line = builder(typeline<any, any, TContext, TMeta>({ onError: state.onError }).pipe(currentLine));
      state.resolver.on(match, line);
      return dispatcher(state);
    },
  };
}

function predicateResolver<TContext, TMeta>(): Resolver<TContext, TMeta> {
  const branches: {
    predicate: (context: TContext) => boolean;
    line: Typeline<any, any, TContext, TMeta>;
  }[] = [];

  return {
    get lines() {
      return branches.map((branch) => branch.line);
    },
    on(predicate: (context: TContext) => boolean, line: Typeline<any, any, TContext, TMeta>) {
      branches.push({ predicate, line });
    },
    resolve(context: TContext) {
      for (const { predicate, line } of branches) {
        if (predicate(context)) {
          return line;
        }
      }
      throw new DispatcherNoMatchError(context);
    },
  };
}
function mapResolver<TContext, TMeta>(selector: (context: TContext) => unknown): Resolver<TContext, TMeta> {
  const map = new Map<unknown, Typeline<any, any, TContext, TMeta>>();

  return {
    get lines() {
      return [...map.values()];
    },
    on(key: unknown, line: Typeline<any, any, TContext, TMeta>) {
      map.set(key, line);
    },
    resolve(context: TContext) {
      const key = selector(context);
      const line = map.get(key);
      if (!line) {
        throw new DispatcherNoMatchError(context);
      }
      return line;
    },
  };
}
export interface Resolver<TContext, TMeta> {
  readonly lines: Typeline<any, any, TContext, TMeta>[];
  on(match: unknown, line: Typeline<any, any, TContext, TMeta>): void;
  resolve(context: TContext): Typeline<any, any, TContext, TMeta>;
}
