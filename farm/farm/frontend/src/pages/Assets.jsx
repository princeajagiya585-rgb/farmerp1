import { useTranslation } from "react-i18next";
import AssetRegister from "../components/AssetRegister";

export default function Assets() {
  const { t } = useTranslation();
  return (
    <AssetRegister
      title={t("assets.title")}
      subtitle={t("assets.subtitle")}
    />
  );
}
