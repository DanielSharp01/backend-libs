import { typeline, type Typeline, type TypelineBuilder } from "./pipeline";

declare const BRANCH_OUTPUT: unique symbol;

interface BranchBuilderResult<TOutput> {
  readonly [BRANCH_OUTPUT]?: TOutput;
}

interface WhenBuilder<TInput, TOutput, TContext, TMeta> extends BranchBuilderResult<TOutput> {
  when<TNarrowed extends TInput, TNextOutput>(
    predicate: (input: TInput) => input is TNarrowed,
    typeline: TypelineBuilder<NoInfer<TNarrowed>, TNextOutput, TContext, TMeta>,
  ): WhenBuilder<Exclude<TInput, TNarrowed>, TOutput | TNextOutput, TContext, TMeta>;
  whenContext<TNarrowed extends TContext, TNextOutput>(
    predicate: (input: TContext) => input is TNarrowed,
    typeline: TypelineBuilder<TInput, TNextOutput, NoInfer<TNarrowed>, TMeta>,
  ): WhenBuilder<TInput, TOutput | TNextOutput, Exclude<TContext, TNarrowed>, TMeta>;
}

export function branch<TInput, TOutput, TContext, TMeta>(
  whenBuilder: (builder: WhenBuilder<TInput, never, TContext, TMeta>) => BranchBuilderResult<TOutput>,
) {
  const branches: {
    predicate: (input: TInput, context: TContext) => boolean;
    line: Typeline<TInput, TOutput, TContext, TMeta>;
  }[] = [];

  whenBuilder({
    when(predicate: (input: TInput) => boolean, typelineBuilder: TypelineBuilder<any, any, any, TMeta>) {
      const line = typelineBuilder(typeline<any, any, any, TMeta>());
      branches.push({ predicate: (input, _) => predicate(input), line });
      return this as any;
    },
    whenContext(predicate: (input: TContext) => boolean, typelineBuilder: TypelineBuilder<any, any, any, TMeta>) {
      const line = typelineBuilder(typeline<any, any, any, TMeta>());
      branches.push({ predicate: (_, context) => predicate(context), line });
      return this as any;
    },
  });

  return (input: TInput, context: TContext) => {
    for (const { predicate, line } of branches) {
      if (predicate(input, context)) {
        return line.push(input, context);
      }
    }
  };
}

export type TypeAtPath<T, P extends readonly PropertyKey[]> = P extends readonly [
  infer K extends PropertyKey,
  ...infer Rest extends readonly PropertyKey[],
]
  ? K extends keyof T
    ? TypeAtPath<T[K], Rest>
    : never
  : T;

export type NarrowTypeAtPath<T, P extends readonly PropertyKey[], V> = T extends unknown
  ? P extends readonly [infer K extends PropertyKey, ...infer Rest extends readonly PropertyKey[]]
    ? K extends keyof T
      ? V extends TypeAtPath<T[K], Rest>
        ? {
            [Key in keyof T]: Key extends K ? NarrowTypeAtPath<T[Key], Rest, V> : T[Key];
          }
        : never
      : never
    : Extract<T, V>
  : never;

export type PathBuilder<TInput, Path extends PropertyKey[] = []> = TInput extends object
  ? {
      [K in keyof TInput]: PathBuilder<TInput[K], [...Path, K]>;
    }
  : Path;

interface OnInputBuilder<TPath extends readonly PropertyKey[], TInput, TOutput, TContext, TMeta>
  extends BranchBuilderResult<TOutput> {
  on<TNarrowed extends TypeAtPath<TInput, TPath>, TNextOutput>(
    key: TNarrowed,
    typeline: TypelineBuilder<NoInfer<NarrowTypeAtPath<TInput, TPath, TNarrowed>>, TNextOutput, TContext, TMeta>,
  ): OnInputBuilder<
    TPath,
    Exclude<TInput, NarrowTypeAtPath<TInput, TPath, TNarrowed>>,
    TOutput | TNextOutput,
    TContext,
    TMeta
  >;
}

export function branchOn<const TPath extends readonly PropertyKey[], TInput, TOutput, TContext, TMeta>(
  pathSelector: (path: PathBuilder<TInput>) => TPath,
  onBuilder: (builder: OnInputBuilder<TPath, TInput, never, TContext, TMeta>) => BranchBuilderResult<TOutput>,
) {
  const map: Map<any, Typeline<TInput, TOutput, TContext, TMeta>> = new Map();

  onBuilder({
    on(key: any, typelineBuilder: TypelineBuilder<any, any, any, TMeta>) {
      const line = typelineBuilder(typeline<any, any, any, TMeta>());
      map.set(key, line);
      return this as any;
    },
  });

  return (input: TInput, context: TContext) => {
    const line = map.get(pathSelector(input as any));
    if (line) {
      return line.push(input, context);
    }
  };
}

interface OnContextBuilder<TPath extends readonly PropertyKey[], TInput, TOutput, TContext, TMeta>
  extends BranchBuilderResult<TOutput> {
  on<TNarrowed extends TypeAtPath<TContext, TPath>, TNextOutput>(
    key: TNarrowed,
    typeline: TypelineBuilder<TInput, TNextOutput, NoInfer<NarrowTypeAtPath<TContext, TPath, TNarrowed>>, TMeta>,
  ): OnContextBuilder<
    TPath,
    TInput,
    TOutput | TNextOutput,
    Exclude<TContext, NarrowTypeAtPath<TContext, TPath, TNarrowed>>,
    TMeta
  >;
}

export function branchOnContext<const TPath extends readonly PropertyKey[], TInput, TOutput, TContext, TMeta>(
  pathSelector: (path: PathBuilder<TContext>) => TPath,
  onBuilder: (builder: OnContextBuilder<TPath, TInput, never, TContext, TMeta>) => BranchBuilderResult<TOutput>,
) {
  const map: Map<any, Typeline<TInput, TOutput, TContext, TMeta>> = new Map();

  onBuilder({
    on(key: any, typelineBuilder: TypelineBuilder<any, any, any, TMeta>) {
      const line = typelineBuilder(typeline<any, any, any, TMeta>());
      map.set(key, line);
      return this as any;
    },
  });

  return (input: TInput, context: TContext) => {
    const line = map.get(pathSelector(context as any));
    if (line) {
      return line.push(input, context);
    }
  };
}
