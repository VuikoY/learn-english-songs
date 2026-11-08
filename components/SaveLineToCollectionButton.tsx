"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { useAuthState } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

type Props = {
  songId: string;
  lineText: string;
  startTime: number;
  endTime: number;
};

type Collection = { id: string; title: string; isOwner: boolean; isPublic: boolean };

function readCollection(value: unknown): Collection | null {
  if (
    typeof value !== "object" || value === null ||
    !("id" in value) || typeof value.id !== "string" ||
    !("title" in value) || typeof value.title !== "string" ||
    !("isOwner" in value) || typeof value.isOwner !== "boolean" ||
    !("isPublic" in value) || typeof value.isPublic !== "boolean"
  ) return null;
  return { id: value.id, title: value.title, isOwner: value.isOwner, isPublic: value.isPublic };
}

function isCollectionList(value: unknown): value is { collections: Collection[] } {
  if (typeof value !== "object" || value === null || !("collections" in value) || !Array.isArray(value.collections)) return false;
  return value.collections.every((item) => readCollection(item) !== null);
}

export default function SaveLineToCollectionButton({ songId, lineText, startTime, endTime }: Props) {
  const { userId, loading: authLoading } = useAuthState();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "error" | "auth">("idle");

  async function openSelector() {
    setOpen((value) => !value);
    setStatus("idle");
    if (open || !userId || collections.length > 0) return;
    setLoading(true);
    try {
      const response = await fetch("/api/word-collections?scope=mine");
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 401) {
        setStatus("auth");
        return;
      }
      if (!response.ok || !isCollectionList(payload)) throw new Error("COLLECTIONS_FAILED");
      setCollections(payload.collections.filter((collection) => collection.isOwner));
    } catch {
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }

  async function addToCollection(collection: Collection) {
    setSavingId(collection.id);
    setStatus("idle");
    try {
      const response = await fetch(`/api/word-collections/${encodeURIComponent(collection.id)}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId, lineText, startTime, endTime }),
      });
      if (response.status === 401) {
        setStatus("auth");
        return;
      }
      if (!response.ok) throw new Error("ITEM_SAVE_FAILED");
      setStatus("saved");
      setOpen(false);
    } catch {
      setStatus("error");
    } finally {
      setSavingId(null);
    }
  }

  async function createAndAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || loading || savingId) return;
    setLoading(true);
    setStatus("idle");
    try {
      const response = await fetch("/api/word-collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const payload: unknown = await response.json().catch(() => null);
      const collection = typeof payload === "object" && payload !== null && "collection" in payload
        ? readCollection(payload.collection)
        : null;
      if (response.status === 401) {
        setStatus("auth");
        return;
      }
      if (!response.ok || !collection) throw new Error("COLLECTION_CREATE_FAILED");
      setCollections((previous) => [collection, ...previous]);
      setNewTitle("");
      await addToCollection(collection);
    } catch {
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={authLoading}
        onClick={() => void openSelector()}
        className="text-xs font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
      >
        {status === "saved" ? t("globalSearch.saved") : t("globalSearch.addToCollection")}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[70] mt-2 w-64 rounded-lg border bg-popover p-3 text-popover-foreground shadow-xl">
          {!userId ? (
            <a href="/auth" className="text-sm text-primary underline">{t("globalSearch.signIn")}</a>
          ) : loading && collections.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{t("globalSearch.loading")}</p>
          ) : (
            <>
              {collections.length > 0 && (
                <div className="mb-3 grid gap-1">
                  <p className="text-xs font-semibold text-muted-foreground">{t("globalSearch.chooseCollection")}</p>
                  {collections.map((collection) => (
                    <button
                      key={collection.id}
                      type="button"
                      disabled={loading || savingId !== null}
                      onClick={() => void addToCollection(collection)}
                      className="rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                    >
                      {savingId === collection.id ? t("globalSearch.saving") : collection.title}
                    </button>
                  ))}
                </div>
              )}
              {collections.length === 0 && <p className="mb-2 text-xs text-muted-foreground">{t("globalSearch.noCollections")}</p>}
              <form onSubmit={(event) => void createAndAdd(event)} className="grid gap-2">
                <label className="text-xs font-medium" htmlFor={`collection-title-${songId}-${startTime}`}>{t("globalSearch.newCollection")}</label>
                <input
                  id={`collection-title-${songId}-${startTime}`}
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  maxLength={80}
                  required
                  placeholder={t("globalSearch.collectionTitle")}
                  className="h-9 rounded border bg-background px-2 text-sm"
                />
                <button type="submit" disabled={loading || savingId !== null} className="rounded bg-primary px-2 py-1.5 text-sm text-primary-foreground disabled:opacity-50">
                  {loading ? t("globalSearch.saving") : t("globalSearch.createAndAdd")}
                </button>
              </form>
            </>
          )}
          {status === "saved" && <p role="status" className="mt-2 text-xs text-green-700 dark:text-green-400">{t("globalSearch.saved")}</p>}
          {status === "auth" && <p role="alert" className="mt-2 text-xs text-destructive">{t("globalSearch.signIn")}</p>}
          {status === "error" && <p role="alert" className="mt-2 text-xs text-destructive">{t("globalSearch.saveError")}</p>}
        </div>
      )}
    </div>
  );
}
