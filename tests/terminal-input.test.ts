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

function createFakeAdapter(options: { inputTty?: boolean; outputTty?: boolean } = {}) {
  const input = new PassThrough();
  const output = new PassThrough();
  const readlineInterface = new FakeReadlineInterface();
  const receivedTerminalOptions: boolean[] = [];
  setTty(input, options.inputTty ?? false);
  setTty(output, options.outputTty ?? false);

  const adapter = createReadlineTerminalInput({
    input,
    interactionOutput: output,
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
    const adapter = createReadlineTerminalInput({ input, interactionOutput: output });

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
    const { adapter, input, readlineInterface } = createFakeAdapter();
    const failure = new Error("input broke");
    const pending = adapter.read();

    input.emit("error", failure);
    readlineInterface.emit("close");

    assert.deepEqual(await pending, { type: "input_error", error: failure });
    assert.deepEqual(adapter.getTerminalOutcome(), { type: "input_error", error: failure });
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
    const baselineInputErrors = input.listenerCount("error");

    for (let iteration = 0; iteration < 3; iteration += 1) {
      const readlineInterface = new FakeReadlineInterface();
      const baseline = {
        line: readlineInterface.listenerCount("line"),
        close: readlineInterface.listenerCount("close"),
        sigint: readlineInterface.listenerCount("SIGINT"),
      };
      const adapter = createReadlineTerminalInput({
        input,
        interactionOutput: output,
        createInterface: () => readlineInterface,
      });

      adapter.close();

      assert.equal(readlineInterface.listenerCount("line"), baseline.line);
      assert.equal(readlineInterface.listenerCount("close"), baseline.close);
      assert.equal(readlineInterface.listenerCount("SIGINT"), baseline.sigint);
      assert.equal(input.listenerCount("error"), baselineInputErrors);
    }
  });

  it("ignores late lines after termination", async () => {
    const { adapter, readlineInterface } = createFakeAdapter();

    readlineInterface.emit("close");
    readlineInterface.emit("line", "too late");

    assert.deepEqual(await adapter.read(), { type: "eof" });
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

  it("enables terminal editing only when both streams are TTYs", () => {
    const { adapter, receivedTerminalOptions } = createFakeAdapter({
      inputTty: true,
      outputTty: true,
    });

    assert.deepEqual(receivedTerminalOptions, [true]);
    adapter.close();
  });
});
