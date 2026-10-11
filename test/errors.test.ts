import { test } from "node:test";
import assert from "node:assert/strict";
import {
  friendlyError,
  TimeoutError,
  UnknownDestinationError,
  ProfileMissingError,
} from "../src/errors.ts";

test("never exposes the raw error text", () => {
  const err = new Error("GET https://api.example.com/x failed with 503 at stack line 42");
  const out = friendlyError(err);
  const text = JSON.stringify(out);
  assert.equal(out.isError, true);
  assert.equal(text.includes("https://"), false);
  assert.equal(text.includes("503"), false);
  assert.equal(text.includes("stack"), false);
});

test("timeouts suggest a retry or a labelled fallback", () => {
  const out = friendlyError(new TimeoutError("slow"));
  assert.match(out.nextStep, /Ask again/);
});

test("unknown destinations echo the query and give a next step", () => {
  const out = friendlyError(new UnknownDestinationError("Atlantis"));
  assert.match(out.message, /Atlantis/);
  assert.match(out.nextStep, /two-letter code/);
});

test("missing profile asks for the nationality", () => {
  const out = friendlyError(new ProfileMissingError());
  assert.match(out.nextStep, /nationality/);
});
