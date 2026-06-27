import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Bell, BellOff, Volume2, VolumeX, Play, Save } from "lucide-react";
import { PageHeader, Card, Button } from "../components/ui";
import { getPrefs, updatePrefs } from "../lib/notifPrefs";
import { playNotificationSound } from "../lib/sound";

export default function NotificationSettings() {
  const { t } = useTranslation();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [mutedTypes, setMutedTypes] = useState([]);
  const [saved, setSaved] = useState(false);

  const NOTIF_TYPES = [
    { value: "TASK", label: t("settings.notifTask"), color: "bg-blue-500" },
    { value: "PAYROLL", label: t("settings.notifPayroll"), color: "bg-purple-500" },
    { value: "INVENTORY", label: t("settings.notifInventory"), color: "bg-yellow-500" },
    { value: "APPROVAL", label: t("settings.notifApproval"), color: "bg-red-500" },
    { value: "ALERT", label: t("settings.notifAlert"), color: "bg-red-500" },
    { value: "INFO", label: t("settings.notifInfo"), color: "bg-gray-400" },
  ];

  useEffect(() => {
    const prefs = getPrefs();
    setSoundEnabled(prefs.soundEnabled);
    setMutedTypes(prefs.mutedTypes || []);
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    // If sound is disabled, clear all muted types
    if (!next) {
      setMutedTypes([]);
    }
  };

  const toggleMutedType = (type) => {
    setMutedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSave = () => {
    updatePrefs({ soundEnabled, mutedTypes });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleTestSound = () => {
    playNotificationSound();
  };

  return (
    <div>
      <PageHeader
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Sound Toggle Card */}
        <Card title={t("settings.sound")} className="lg:col-span-1">
          <div className="flex flex-col items-center gap-4 text-center">
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-full transition ${
                soundEnabled
                  ? "bg-brand-100 text-brand-600"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {soundEnabled ? <Volume2 size={36} /> : <VolumeX size={36} />}
            </div>
            <p className="text-lg font-semibold text-gray-800">
              {soundEnabled ? t("settings.soundOn") : t("settings.soundOff")}
            </p>
            <p className="text-sm text-gray-500">
              {soundEnabled
                ? t("settings.soundOnDesc")
                : t("settings.soundOffDesc")}
            </p>

            <button
              onClick={toggleSound}
              className={`inline-flex items-center gap-2 rounded-full px-6 py-2 text-sm font-semibold transition ${
                soundEnabled
                  ? "bg-gray-200 text-gray-700 hover:bg-gray-300"
                  : "bg-brand-600 text-white hover:bg-brand-700"
              }`}
            >
              {soundEnabled ? (
                <>
                  <VolumeX size={16} />
                  {t("settings.muteAll")}
                </>
              ) : (
                <>
                  <Volume2 size={16} />
                  {t("settings.enableSounds")}
                </>
              )}
            </button>

            {soundEnabled && (
              <button
                onClick={handleTestSound}
                className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700"
              >
                <Play size={14} />
                {t("settings.testSound")}
              </button>
            )}
          </div>
        </Card>

        {/* Notification Type Filters */}
        <div className="lg:col-span-2">
          <Card title={t("settings.notificationType")}>
            <p className="mb-4 text-sm text-gray-500">
              {t("settings.typeDescription")}
            </p>

            <div className="space-y-1">
              {NOTIF_TYPES.map((nt) => {
                const isMuted = mutedTypes.includes(nt.value);
                const isGloballyMuted = !soundEnabled;

                return (
                  <label
                    key={nt.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 transition ${
                      isGloballyMuted
                        ? "opacity-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        checked={!isMuted}
                        disabled={isGloballyMuted}
                        onChange={() => toggleMutedType(nt.value)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                    </div>
                    <span
                      className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${nt.color}`}
                    />
                    <span className="flex-1 text-sm font-medium text-gray-700">
                      {nt.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      {isMuted ? t("settings.muted") : t("settings.active")}
                    </span>
                  </label>
                );
              })}
            </div>
          </Card>

          {/* Save Button */}
          <div className="mt-4 flex justify-end">
            <Button onClick={handleSave}>
              <Save size={16} />
              {saved ? t("settings.saved") : t("settings.savePrefs")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
