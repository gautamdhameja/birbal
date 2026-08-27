import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, it } from "node:test";

import {
  createReadlineTerminalInput,
  type ReadlineInterfaceLike,
} from "../src/app/terminal/readline.js";

class FakeReadlineInterface extends EventEmitter implements ReadlineInterfaceLike {
  closeCalls = 0;

  close(): void {
    this.closeCalls += 1;
    this.emit("close");
  }
}

function setTty(stream: PassThrough, isTty: boolean): void {
  Object.defineProperty(stream, "isTTY", {
    configurable: true,
    value: isTty,
  });
}

function createFakeAdapter(
  options: {
    inputTty?: boolean;
    outputTty?: boolean;
    maxQueuedCharacters?: number;
    interruptSignalSource?: EventEmitter;
  } = {},
) {
  const input = new PassThrough();
  const output = new PassThrough();
  const readlineInterface = new FakeReadlineInterface();
  const interruptSignalSource = options.interruptSignalSource ?? new EventEmitter();
  const receivedTerminalOptions: boolean[] = [];
  setTty(input, options.inputTty ?? false);
  setTty(output, options.outputTty ?? false);

  const adapter = createReadlineTerminalInput({
    input,
    interactionOutput: output,
    maxQueuedCharacters: options.maxQueuedCharacters ?? 1_024,
    interruptSignalSource,
    createInterface: (readlineOptions) => {
      receivedTerminalOptions.push(Boolean(readlineOptions.terminal));
      return readlineInterface;
    },
  });

  return {
    adapter,
    input,
    output,
    readlineInterface,
    interruptSignalSource,
    receivedTerminalOptions,
  };
}

describe("Node terminal input adapter", () => {
  it("returns type-ahead lines once in FIFO order", async () => {
    const { adapter, readlineInterface } = createFakeAdapter();

    readlineInterface.emit("line", "first");
    readlineInterface.emit("line", "second");

    assert.deepEqual(await adapter.read(), { type: "line", line: "first" });
    assert.deepEqual(await adapter.read(), { type: "line", line: "second" });
    adapter.close();
  });

  it("delivers a final unterminated line before EOF", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const adapter = createReadlineTerminalInput({
      input,
      interactionOutput: output,
      maxQueuedCharacters: 1_024,
    });

    input.end("last line");

    assert.deepEqual(await adapter.read(), { type: "line", line: "last line" });
    assert.deepEqual(await adapter.read(), { type: "eof" });
    adapter.close();
  });

  it("resolves a pending read with EOF", async () => {
    const { adapter, readlineInterface } = createFakeAdapter();
    const pending = adapter.read();

    readlineInterface.emit("close");

    assert.deepEqual(await pending, { type: "eof" });
    assert.deepEqual(adapter.getTerminalOutcome(), { type: "eof" });
  });

  it("lets SIGINT preempt queued lines and the subsequent close event", async () => {
    const { adapter, readlineInterface } = createFakeAdapter();

    readlineInterface.emit("line", "queued");
    readlineInterface.emit("SIGINT");
    readlineInterface.emit("close");

    assert.deepEqual(await adapter.read(), { type: "interrupted" });
    assert.deepEqual(adapter.getTerminalOutcome(), { type: "interrupted" });
  });

  it("reports input errors distinctly from EOF", async () => {
    const { adapter, readlineInterface } = createFakeAdapter();
    const failure = new Error("input broke");
    const pending = adapter.read();

    readlineInterface.emit("error", failure);
    readlineInterface.emit("close");

    assert.deepEqual(await pending, { type: "input_error", error: failure });
    assert.deepEqual(adapter.getTerminalOutcome(), { type: "input_error", error: failure });
  });

  it("handles errors forwarded by the real Node readline interface", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const interruptSignalSource = new EventEmitter();
    const adapter = createReadlineTerminalInput({
      input,
      interactionOutput: output,
      maxQueuedCharacters: 1_024,
      interruptSignalSource,
    });
    const failure = new Error("input broke");
    const pending = adapter.read();

    input.emit("error", failure);

    assert.deepEqual(await pending, { type: "input_error", error: failure });
    assert.deepEqual(adapter.getTerminalOutcome(), { type: "input_error", error: failure });
    assert.equal(input.listenerCount("error"), 0);
    assert.equal(interruptSignalSource.listenerCount("SIGINT"), 0);
    adapter.close();
  });

  it("closes idempotently and settles a pending read", async () => {
    const { adapter, readlineInterface } = createFakeAdapter();
    const pending = adapter.read();

    adapter.close();
    adapter.close();

    assert.deepEqual(await pending, { type: "eof" });
    assert.equal(readlineInterface.closeCalls, 1);
  });

  it("restores listener counts across repeated adapters", () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const interruptSignalSource = new EventEmitter();
    const baselineInputErrors = input.listenerCount("error");
    const baselineInterrupts = interruptSignalSource.listenerCount("SIGINT");

    for (let iteration = 0; iteration < 3; iteration += 1) {
      const readlineInterface = new FakeReadlineInterface();
      const baseline = {
        line: readlineInterface.listenerCount("line"),
        close: readlineInterface.listenerCount("close"),
        sigint: readlineInterface.listenerCount("SIGINT"),
        error: readlineInterface.listenerCount("error"),
      };
      const adapter = createReadlineTerminalInput({
        input,
        interactionOutput: output,
        maxQueuedCharacters: 1_024,
        interruptSignalSource,
        createInterface: () => readlineInterface,
      });

      adapter.close();

      assert.equal(readlineInterface.listenerCount("line"), baseline.line);
      assert.equal(readlineInterface.listenerCount("close"), baseline.close);
      assert.equal(readlineInterface.listenerCount("SIGINT"), baseline.sigint);
      assert.equal(readlineInterface.listenerCount("error"), baseline.error);
      assert.equal(input.listenerCount("error"), baselineInputErrors);
      assert.equal(interruptSignalSource.listenerCount("SIGINT"), baselineInterrupts);
    }
  });

  it("ignores late lines after termination", async () => {
    const { adapter, readlineInterface } = createFakeAdapter();

    readlineInterface.emit("close");
    readlineInterface.emit("line", "too late");

    assert.deepEqual(await adapter.read(), { type: "eof" });
  });

  it("accepts a queued line exactly at the character budget", async () => {
    const { adapter, readlineInterface } = createFakeAdapter({ maxQueuedCharacters: 5 });

    readlineInterface.emit("line", "four");

    assert.deepEqual(await adapter.read(), { type: "line", line: "four" });
    assert.equal(adapter.getTerminalOutcome(), undefined);
    adapter.close();
  });

  it("turns queue-budget overflow into a terminal input error", async () => {
    const { adapter, readlineInterface } = createFakeAdapter({ maxQueuedCharacters: 5 });

    readlineInterface.emit("line", "queued");
    readlineInterface.emit("close");

    const outcome = await adapter.read();
    assert.equal(outcome.type, "input_error");
    if (outcome.type === "input_error") {
      assert.match(outcome.error.message, /queue exceeded its 5 character limit/i);
    }
    assert.equal(adapter.getTerminalOutcome()?.type, "input_error");
    assert.equal(readlineInterface.closeCalls, 1);
  });

  it("reclaims consumed queue budget and preserves FIFO after compaction", async () => {
    const initialLines = Array.from({ length: 130 }, (_, index) => `line-${index}`);
    const replacementLines = initialLines.slice(0, 70);
    const initialBudget = initialLines.reduce((total, line) => total + line.length + 1, 0);
    const { adapter, readlineInterface } = createFakeAdapter({
      maxQueuedCharacters: initialBudget,
    });

    for (const line of initialLines) {
      readlineInterface.emit("line", line);
    }
    for (const line of initialLines.slice(0, 70)) {
      assert.deepEqual(await adapter.read(), { type: "line", line });
    }

    for (const line of replacementLines) {
      readlineInterface.emit("line", line);
    }
    for (const line of [...initialLines.slice(70), ...replacementLines]) {
      assert.deepEqual(await adapter.read(), { type: "line", line });
    }

    readlineInterface.emit("line", "after-reset");
    assert.deepEqual(await adapter.read(), { type: "line", line: "after-reset" });
    assert.equal(adapter.getTerminalOutcome(), undefined);
    adapter.close();
  });

  for (const ttyCombination of [
    { inputTty: false, outputTty: false },
    { inputTty: false, outputTty: true },
    { inputTty: true, outputTty: false },
  ]) {
    it(`disables terminal editing for inputTTY=${ttyCombination.inputTty} outputTTY=${ttyCombination.outputTty}`, () => {
      const { adapter, receivedTerminalOptions } = createFakeAdapter(ttyCombination);

      assert.deepEqual(receivedTerminalOptions, [false]);
      adapter.close();
    });
  }

  for (const ttyCombination of [
    { inputTty: false, outputTty: false },
    { inputTty: false, outputTty: true },
    { inputTty: true, outputTty: false },
  ]) {
    it(`latches SIGINT for inputTTY=${ttyCombination.inputTty} outputTTY=${ttyCombination.outputTty}`, async () => {
      const { adapter, interruptSignalSource, readlineInterface } =
        createFakeAdapter(ttyCombination);
      const pending = adapter.read();

      interruptSignalSource.emit("SIGINT");

      assert.deepEqual(await pending, { type: "interrupted" });
      assert.deepEqual(adapter.getTerminalOutcome(), { type: "interrupted" });
      assert.equal(interruptSignalSource.listenerCount("SIGINT"), 0);
      assert.equal(readlineInterface.closeCalls, 1);
    });
  }

  it("enables terminal editing only when both streams are TTYs", () => {
    const { adapter, receivedTerminalOptions } = createFakeAdapter({
      inputTty: true,
      outputTty: true,
    });

    assert.deepEqual(receivedTerminalOptions, [true]);
    adapter.close();
  });
});
