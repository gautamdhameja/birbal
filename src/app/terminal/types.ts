import type { ArchitectureLabInput, ArchitectureLabInputPort } from "../architecture-lab/types.js";

export type TerminalInputLine = Extract<ArchitectureLabInput, { type: "line" }>;
export type TerminalInputEnd = Extract<ArchitectureLabInput, { type: "eof" }>;
export type TerminalInputInterrupt = Extract<ArchitectureLabInput, { type: "interrupted" }>;
export type TerminalInputFailure = Extract<ArchitectureLabInput, { type: "input_error" }> & {
  error: Error;
};

export type TerminalInputOutcome =
  | TerminalInputLine
  | TerminalInputEnd
  | TerminalInputInterrupt
  | TerminalInputFailure;

export type TerminalInputTerminalOutcome = Exclude<TerminalInputOutcome, TerminalInputLine>;

export type TerminalInputPort = Omit<ArchitectureLabInputPort, "read"> & {
  read(): Promise<TerminalInputOutcome>;
  getTerminalOutcome(): TerminalInputTerminalOutcome | undefined;
  close(): void;
};
