type LoggerMethods<TSeverity extends string> = {
  [K in TSeverity]: (message: string, details?: object) => void;
};

export type Logger<TSeverity extends string> = LoggerMethods<TSeverity> & {
  log(severity: TSeverity, message: string, details?: object): void;
  withScope(...scope: readonly string[]): Logger<TSeverity>;
};

export function consoleLogger<TSeverity extends string>(
  severityConfig: Record<TSeverity, { command: (...args: unknown[]) => void; tag: string }>,
): Logger<TSeverity> {
  return loggerInternal([], Object.keys(severityConfig) as TSeverity[], (severity, scope, message, details) => {
    const { command, tag } = severityConfig[severity];
    command(tag, ...scope, message, ...(details === undefined ? [] : [details]));
  });
}

export function logger<TSeverity extends string>(
  severities: TSeverity[],
  sink: (severity: TSeverity, scope: readonly string[], message: string, details?: object) => void,
): Logger<TSeverity> {
  return loggerInternal([], severities, sink);
}

function loggerInternal<TSeverity extends string>(
  scope: readonly string[],
  severities: TSeverity[],
  sink: (severity: TSeverity, scope: readonly string[], message: string, details?: object) => void,
): Logger<TSeverity> {
  return {
    ...Object.fromEntries(
      severities.map((severity) => [
        severity,
        (message: string, details: object) => sink(severity, scope, message, details),
      ]),
    ),
    log: (severity, message, details) => {
      sink(severity, scope, message, details);
    },
    withScope: (...scopeAdditions: readonly string[]) => {
      return loggerInternal([...scope, ...scopeAdditions], severities, sink);
    },
  } as Logger<TSeverity>;
}
