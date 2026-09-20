"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { parseJson } from "@/lib/utils";

type Doc = { id: string; filename: string; mimeType: string };
type Policy = {
  id: string;
  type: string;
  carrier: string;
  namedInsured: string;
  owner: string;
  coveredMembers: string;
  vehicleId: string | null;
  documents: Doc[];
};

const SECTIONS = [
  { id: "health", label: "Health" },
  { id: "vehicle", label: "Vehicle" },
  { id: "home", label: "Home" },
] as const;

const HEALTH_KINDS = [
  { id: "health", label: "Medical" },
  { id: "vision", label: "Vision" },
  { id: "dental", label: "Dental" },
] as const;

export function InsuranceDesk({
  policies,
  vehicles,
  names,
}: {
  policies: Policy[];
  properties: { id: string; label: string; estimate: number }[];
  vehicles: { id: string; label: string }[];
  names: { nameA: string; nameB: string; children: { id: string; name: string }[] };
}) {
  const router = useRouter();
  const members = useMemo(
    () => [
      { id: "a", label: names.nameA },
      { id: "b", label: names.nameB },
      ...names.children.map((c) => ({ id: `child:${c.id}`, label: c.name.trim().split(/\s+/)[0] ?? c.name })),
    ],
    [names],
  );
  const [section, setSection] = useState<string>("health");
  const [healthMember, setHealthMember] = useState(members[0]?.id ?? "a");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function uploadCard(type: string, file: File, opts?: { memberId?: string; vehicleId?: string }) {
    const memberId = opts?.memberId;
    const vehicleId = opts?.vehicleId;
    const key = `${type}:${memberId ?? vehicleId ?? "joint"}`;
    setBusyKey(key);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const up = await fetch("/api/insurance/parse", { method: "POST", body: fd });
      const data = await up.json();
      if (!up.ok) {
        toast.error(data.error ?? "Could not upload.");
        return;
      }
      const matches = policies.filter((p) => {
        if (vehicleId) return p.type === "vehicle" && p.vehicleId === vehicleId;
        if (memberId) return p.type === type && policyCoversMember(p, memberId);
        return p.type === type && !p.vehicleId;
      });
      const album = matches[0];
      const res = await fetch("/api/insurance/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: album?.id,
          type,
          carrier: "ID card",
          namedInsured: memberId ?? "joint",
          owner: memberId ?? "joint",
          vehicleId: vehicleId ?? null,
          coveredMembers: memberId ? [memberId] : [],
          notes: "screenshot",
          tempId: data.tempId,
          filename: data.filename,
          mimeType: data.mimeType,
          ext: data.ext,
        }),
      });
      if (!res.ok) toast.error("Could not save card.");
      else {
        for (const extra of matches.slice(1)) {
          await fetch("/api/insurance/policies", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: extra.id }),
          });
        }
        toast.success(album ? "Card replaced." : "Card saved.");
        router.refresh();
      }
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Tabs value={section} onValueChange={setSection}>
      <TabsList>
        {SECTIONS.map((s) => (
          <TabsTrigger key={s.id} value={s.id}>
            {s.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {SECTIONS.map((s) => {
        if (s.id === "health") {
          return (
            <TabsContent key={s.id} value={s.id} className="space-y-4">
              <Tabs value={healthMember} onValueChange={setHealthMember}>
                <div className="section-head">
                  <span className="kicker">Covered member</span>
                  <TabsList>
                    {members.map((m) => (
                      <TabsTrigger key={m.id} value={m.id}>
                        {m.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                {members.map((m) => (
                  <TabsContent key={m.id} value={m.id}>
                    <div className="grid grid-cols-3 gap-4">
                      {HEALTH_KINDS.map((kind) => {
                        const card = policies.find((p) => p.type === kind.id && policyCoversMember(p, m.id));
                        return (
                          <CardSlot
                            key={kind.id}
                            title={kind.label}
                            policy={card}
                            busy={busyKey === `${kind.id}:${m.id}`}
                            onFile={(f) => void uploadCard(kind.id, f, { memberId: m.id })}
                            onDeleted={() => router.refresh()}
                          />
                        );
                      })}
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </TabsContent>
          );
        }
        if (s.id === "vehicle") {
          return (
            <TabsContent key={s.id} value={s.id}>
              {vehicles.length === 0 ? (
                <p className="text-sm text-muted-foreground">Add vehicles on the Vehicles page to attach insurance cards here.</p>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {vehicles.map((v) => {
                    const card = policies.find((p) => p.type === "vehicle" && p.vehicleId === v.id);
                    return (
                      <CardSlot
                        key={v.id}
                        title={v.label}
                        policy={card}
                        busy={busyKey === `vehicle:${v.id}`}
                        onFile={(f) => void uploadCard("vehicle", f, { vehicleId: v.id })}
                        onDeleted={() => router.refresh()}
                      />
                    );
                  })}
                </div>
              )}
            </TabsContent>
          );
        }
        const card = policies.find((p) => p.type === s.id && !p.vehicleId);
        return (
          <TabsContent key={s.id} value={s.id}>
            <div className="grid grid-cols-3 gap-4">
              <CardSlot
                title={s.label}
                policy={card}
                busy={busyKey === `${s.id}:joint`}
                onFile={(f) => void uploadCard(s.id, f)}
                onDeleted={() => router.refresh()}
              />
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

function policyCoversMember(p: Policy, memberId: string) {
  if (p.owner === memberId || p.namedInsured === memberId) return true;
  const members = parseJson<string[]>(p.coveredMembers, []);
  return members.includes(memberId);
}

function CardSlot({
  title,
  policy,
  busy,
  onFile,
  onDeleted,
}: {
  title: string;
  policy?: Policy;
  busy: boolean;
  onFile: (f: File) => void;
  onDeleted: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const doc = policy?.documents[0];

  return (
    <Card className="w-full">
      <CardContent className="space-y-3 p-4">
        <div className="kicker">{title}</div>
        {doc?.mimeType.startsWith("image/") ? (
          <a href={`/api/insurance/files/${doc.id}`} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/insurance/files/${doc.id}`}
              alt={doc.filename}
              className="aspect-[1.6/1] w-full rounded-md bg-secondary object-contain"
            />
          </a>
        ) : doc ? (
          <a href={`/api/insurance/files/${doc.id}`} target="_blank" rel="noreferrer" className="text-xs text-primary">
            {doc.filename}
          </a>
        ) : (
          <div className="flex aspect-[1.6/1] items-center justify-center rounded-md bg-secondary text-xs text-muted-foreground">
            No card
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onFile(f);
          }}
        />
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? "Saving…" : policy ? "Reupload" : "Upload"}
          </Button>
          {policy ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={async () => {
                await fetch("/api/insurance/policies", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: policy.id }),
                });
                onDeleted();
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
