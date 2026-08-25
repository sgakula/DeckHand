"use client";

import { useState } from "react";
import { PageHeader, SectionHeader } from "@/components/PageHeader";
import { useWorkspace } from "@/components/WorkspaceProvider";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Alert, EmptyState } from "@/components/ui/Status";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import styles from "./sources.module.css";

export default function SourcesPage() {
  const { pid, presentation, refreshPresentation } = useWorkspace();
  const toast = useToast();
  const action = useAction();
  const [fileIds, setFileIds] = useState("");

  const facts = presentation?.facts ?? [];
  const connectedIds = presentation?.source_file_ids ?? [];

  const connect = async () => {
    const ids = fileIds
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      toast.error("Paste at least one Drive file id");
      return;
    }
    const result = await action.run(() => api.connectSources(pid, ids));
    if (result) {
      setFileIds("");
      refreshPresentation();
      toast.success(
        result.facts.length
          ? `Extracted ${plural(result.facts.length, "fact")}`
          : "Connected, but no facts were extracted",
      );
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Phase 0"
        title="Sources"
        description="Connect Drive files — Sheets, Docs, Slides — and the context agent pulls out the numbers and claims it can cite. Everything the builder puts on a slide traces back to one of these."
        actions={
          facts.length > 0 ? (
            <Badge tone="success" dot>
              {plural(facts.length, "fact")}
            </Badge>
          ) : undefined
        }
      />

      <div className={styles.layout}>
        <Card>
          <CardHeader
            title="Connect Drive files"
            subtitle="Paste one or more Drive file ids. Re-running replaces the current fact set."
          />
          <div className={styles.connectRow}>
            <div className={styles.connectField}>
              <Field
                label="Drive file ids"
                hint="Comma or space separated. Requires Google to be connected."
              >
                <Input
                  value={fileIds}
                  placeholder="1AbC…xyz, 1DeF…uvw"
                  onChange={(e) => setFileIds(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void connect();
                  }}
                />
              </Field>
            </div>
            <Button
              variant="primary"
              onClick={connect}
              pending={action.pending}
              leading={<Icon name="sparkle" size={16} />}
            >
              Extract facts
            </Button>
          </div>

          {action.error && (
            <div style={{ marginTop: "var(--s4)" }}>
              <Alert tone="danger" title="Could not extract facts">
                {action.error}
              </Alert>
            </div>
          )}

          <div style={{ marginTop: "var(--s5)" }} className={styles.help}>
            <span>
              A Drive file id is the long string in the document URL, between{" "}
              <code>/d/</code> and <code>/edit</code>.
            </span>
            <span>
              This step is optional — you can build a deck without it, but any number on a
              slide will then be flagged as unsourced during rehearsal.
            </span>
          </div>
        </Card>

        {connectedIds.length > 0 && (
          <div>
            <SectionHeader title="Connected files" first />
            <div className={styles.fileList}>
              {connectedIds.map((id) => (
                <Badge key={id} tone="neutral" pill>
                  <Icon name="link" size={12} />
                  {id}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div>
          <SectionHeader
            title="Extracted facts"
            actions={
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshPresentation}
                leading={<Icon name="refresh" size={15} />}
              >
                Refresh
              </Button>
            }
          />

          {facts.length === 0 ? (
            <Card pad="none">
              <EmptyState
                icon={<Icon name="sources" size={24} />}
                title="No facts yet"
                body="Connect a Sheet or Doc above and the context agent will pull out the numbers it can cite, each tagged with where it came from."
                compact
              />
            </Card>
          ) : (
            <div className={styles.facts}>
              {facts.map((f, i) => (
                <div key={i} className={styles.fact} style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
                  <div className={styles.factText}>{f.fact}</div>
                  {f.value && <div className={styles.factValue}>{f.value}</div>}
                  {(f.source_doc || f.source_ref) && (
                    <div className={styles.factSource}>
                      {f.source_doc && (
                        <span className={styles.sourceChip}>
                          <Icon name="sources" size={13} />
                          {f.source_doc}
                        </span>
                      )}
                      {f.source_ref && (
                        <span className={styles.sourceChip}>
                          <Icon name="link" size={13} />
                          {f.source_ref}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
