import { useTranslation } from "react-i18next";
import AssetRegister from "../components/AssetRegister";

export default function Equipment() {
  const { t } = useTranslation();
  return (
    <AssetRegister
      title={t("equipment.titlePg")}
      subtitle={t("equipment.subtitlePg")}
      listParams={{ kind: "equipment" }}
    />
  );
}
