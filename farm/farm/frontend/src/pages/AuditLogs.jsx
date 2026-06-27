import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { resource } from "../lib/api";
import { Badge, Card, PageHeader, Table } from "../components/ui";

const repo = resource("reporting/audit-logs");
const actionColor = {
  CREATE: "green", UPDATE: "blue", DELETE: "red", LOGIN: "purple", LOGOUT: "gray", APPROVE: "green", REJECT: "red",
};

export default function AuditLogs() {
  const { t } = useTranslation();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    repo.list().then((d) => setRows(Array.isArray(d) ? d : d.results || []));
  }, []);

  return (
    <div>
      <PageHeader title={t("audit.title")} subtitle={t("audit.subtitle")} />
      <Card>
        <Table
          columns={[
            { key: "timestamp", header: t("header.time"), render: (r) => new Date(r.timestamp).toLocaleString() },
            { key: "user_name", header: t("header.user"), render: (r) => r.user_name || "System" },
            { key: "action", header: t("header.actions"), render: (r) => <Badge color={actionColor[r.action] || "gray"}>{t(`audit.action${r.action}`)}</Badge> },
            { key: "method", header: t("header.method") },
            { key: "path", header: t("header.path") },
            { key: "ip_address", header: t("header.ip") },
          ]}
          rows={rows}
        />
      </Card>
    </div>
  );
}
