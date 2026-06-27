import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { resource } from "../lib/api";
import { Card, PageHeader, Table } from "../components/ui";

const versions = resource("documents/versions");

export default function DocumentVersions() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);

  useEffect(() => {
    versions.list({ page_size: 200 }).then((d) => setRows(Array.isArray(d) ? d : d.results || [])).catch(() => {});
  }, []);

  return (
    <div>
      <PageHeader title={t("documentVersions.title")} subtitle={t("documentVersions.subtitle")} />
      <Card>
        <Table
          empty="No archived versions yet."
          columns={[
            { key: "document_title", header: t("header.document") },
            { key: "version", header: t("header.ver"), render: (r) => `v${r.version}` },
            { key: "notes", header: t("header.notes"), render: (r) => r.notes || "—" },
            { key: "created_at", header: t("header.archived"), render: (r) => new Date(r.created_at).toLocaleString() },
            {
              key: "file",
              header: t("header.file"),
              render: (r) => r.file ? (
                <a href={r.file} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                  <Download size={14} /> Download
                </a>
              ) : "—",
            },
          ]}
          rows={rows}
        />
      </Card>
    </div>
  );
}
