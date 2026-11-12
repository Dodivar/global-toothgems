"use client";

import { readFunctionFailure } from "./supabase/functionError";
import { supabase } from "./supabase/client";
import {
  archiveFiles,
  reauthMethodOf,
  readBlockers,
  readDeleteAnswer,
  readExportAnswer,
  withFileLinks,
  type DeleteAnswer,
  type ErasureBlocker,
  type ReauthMethod,
  type ExportAnswer,
} from "./accountPrivacyMapping";

/**
 * The persistence boundary of the member's privacy rights (decision 125):
 * the export is built by the database (`my_personal_data()`, the signed-in
 * account only), the erasure by the Edge Function `delete-account`. The page
 * never decides who may do what: RLS, the functions and the database do.
 */

/** How long the download links of the member's files in the archive stay valid. */
export const FILE_LINK_DAYS = 7;
const FILE_LINK_SECONDS = FILE_LINK_DAYS * 24 * 60 * 60;

/**
 * The member's archive, with a download link on each of their files the
 * browser may sign (the buckets' owner policies decide; a file that cannot be
 * signed keeps its path).
 */
export async function fetchPersonalData(): Promise<ExportAnswer> {
  if (!supabase) return { kind: "error" };
  const { data, error } = await supabase.rpc("my_personal_data");
  if (error) return { kind: "error" };
  const answer = readExportAnswer(data);
  if (answer.kind !== "ok") return answer;

  const byBucket = new Map<string, string[]>();
  for (const file of archiveFiles(answer.archive)) {
    byBucket.set(file.bucket, [...(byBucket.get(file.bucket) ?? []), file.path]);
  }
  const links = new Map<string, string>();
  for (const [bucket, paths] of byBucket) {
    const { data: signed } = await supabase.storage.from(bucket).createSignedUrls(paths, FILE_LINK_SECONDS);
    for (const entry of signed ?? []) {
      if (entry.signedUrl && entry.path) links.set(`${bucket}/${entry.path}`, entry.signedUrl);
    }
  }
  const expireAt = new Date(Date.now() + FILE_LINK_SECONDS * 1000).toISOString();
  return { kind: "ok", archive: withFileLinks(answer.archive, links, expireAt) };
}

/** What stops the member's erasure now (read as the member). Null when it could not be read. */
export async function fetchErasureBlockers(): Promise<ErasureBlocker[] | null> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("my_account_erasure_blockers");
  return error ? null : readBlockers(data);
}

/** How the signed-in account confirms: its password, else a fresh sign-in with Google or Apple. */
export async function accountReauthMethod(): Promise<ReauthMethod> {
  if (!supabase) return "password";
  const { data } = await supabase.auth.getUser();
  return reauthMethodOf(data.user?.app_metadata?.providers);
}

export async function deleteOwnAccount(): Promise<DeleteAnswer> {
  if (!supabase) return { kind: "error" };
  const { data, error } = await supabase.functions.invoke("delete-account", { body: { confirm: true } });
  if (!error) return readDeleteAnswer(200, data);
  const failure = await readFunctionFailure(error);
  if (failure.kind === "http" && failure.body !== undefined) return readDeleteAnswer(failure.status, failure.body);
  return { kind: "error" };
}
