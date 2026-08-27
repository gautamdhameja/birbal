export type TerminalInputLine = {
  type: "line";
  line: string;
};

export type TerminalInputEnd = {
  type: "eof";
};

export type TerminalInputInterrupt = {
  type: "interrupted";
};

export type TerminalInputFailure = {
  type: "input_error";
  error: Error;
};

export type TerminalInputOutcome =
  | TerminalInputLine
  | TerminalInputEnd
  | TerminalInputInterrupt
  | TerminalInputFailure;

export type TerminalInputTerminalOutcome = Exclude<TerminalInputOutcome, TerminalInputLine>;

export type TerminalInputPort = {
  read(): Promise<TerminalInputOutcome>;
  getTerminalOutcome(): TerminalInputTerminalOutcome | undefined;
  close(): void;
};
