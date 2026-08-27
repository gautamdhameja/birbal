import type { ArchitectureLabInput, ArchitectureLabInputPort } from "../architecture-lab/types.js";
import type { ReadLineOptions } from "node:readline";

type TtyReadableStream = NodeJS.ReadableStream & {
  isTTY?: boolean;
};

type TtyWritableStream = NodeJS.WritableStream & {
  isTTY?: boolean;
};

export type ReadlineInterfaceLike = {
  on(event: "line", listener: (line: string) => void): unknown;
  on(event: "close" | "SIGINT", listener: () => void): unknown;
  on(event: "error", listener: (error: unknown) => void): unknown;
  off(event: "line", listener: (line: string) => void): unknown;
  off(event: "close" | "SIGINT", listener: () => void): unknown;
  off(event: "error", listener: (error: unknown) => void): unknown;
  close(): void;
};

export type ReadlineInterfaceFactory = (options: ReadLineOptions) => ReadlineInterfaceLike;

export type InterruptSignalSource = {
  on(event: "SIGINT", listener: () => void): unknown;
  off(event: "SIGINT", listener: () => void): unknown;
};

export type ReadlineTerminalInputOptions = {
  input: TtyReadableStream;
  interactionOutput: TtyWritableStream;
  maxQueuedCharacters: number;
  interruptSignalSource?: InterruptSignalSource;
  createInterface?: ReadlineInterfaceFactory;
};

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
