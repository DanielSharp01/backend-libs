import { isPipelineStop, typeline, type TypelineBuilder } from "./pipeline";

export function catchErr<TInput, TOutput, TErrorOutput, TContext, TMeta>(
  build: TypelineBuilder<TInput, TOutput, TContext, TMeta>,
  onError: TypelineBuilder<unknown, TErrorOutput, TContext, TMeta>,
) {
  const line = build(typeline<TInput, TInput, TContext, TMeta>());
  const errorLine = onError(typeline<unknown, unknown, TContext, TMeta>());

  return {
    mw: async (input: TInput, context: TContext): Promise<TOutput | TErrorOutput> => {
      try {
        return await line.push(input, context);
      } catch (error) {
        if (isPipelineStop(error)) {
          throw error;
        }
        return await errorLine.push(error, context);
      }
    },
    metadata: [...line.metadata, ...errorLine.metadata],
  };
}
