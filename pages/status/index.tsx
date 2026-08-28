import useSWR from "swr";
import Head from "next/head";
import { Activity, Database, Loader2, Server } from "lucide-react";

import { StoreHomeLayout } from "components/store/StoreHomeLayout";
import { useI18n } from "lib/i18n";

const fetchAPI = async (key: string) => {
  const response = await fetch(key);
  const responseBody = await response.json();
  return responseBody;
};

const StatusPage = () => {
  const { t } = useI18n();
  return (
    <>
      <Head>
        <title>{t("System Status | Manifold")}</title>
        <meta name="theme-color" content="#0b0812" />
      </Head>
      <main className="min-h-[70vh] bg-[#0b0812] px-4 py-12 text-white sm:px-6 lg:px-10 lg:py-16">
        <div className="mx-auto max-w-4xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">
            {t("Live infrastructure")}
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">
            {t("Manifold status")}
          </h1>
          <UpdatedAt />

          <section className="mt-10 rounded-xl border border-white/[0.08] bg-[#14101c] p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-violet-500/15 p-2 text-violet-300">
                  <Database size={20} />
                </span>
                <div>
                  <h2 className="font-bold">{t("Database")}</h2>
                  <p className="text-xs text-white/40">
                    {t("Primary data service")}
                  </p>
                </div>
              </div>
              <span className="flex items-center gap-2 text-sm font-semibold text-white/45">
                <Activity size={16} /> {t("Live check")}
              </span>
            </div>
            <DatabaseStatus />
          </section>
        </div>
      </main>
    </>
  );
};

const UpdatedAt = () => {
  const { locale, t } = useI18n();
  const { data, error } = useSWR("/api/v1/status", fetchAPI, {
    refreshInterval: 2000,
  });

  let updatedAtText = t("Loading...");

  if (data?.updated_at) {
    updatedAtText = new Date(data.updated_at).toLocaleString(locale);
  } else if (data) {
    updatedAtText = t("Unavailable");
  }

  if (error) {
    updatedAtText = t("Error");
  }

  return (
    <>
      <p className="mt-3 flex items-center gap-2 text-sm text-white/45">
        <Server size={14} />{" "}
        {t("Last updated: {time}", { time: updatedAtText })}
      </p>
    </>
  );
};

const DatabaseStatus = () => {
  const { t } = useI18n();
  const { data, error, isLoading } = useSWR("/api/v1/status", fetchAPI, {
    refreshInterval: 2000,
  });
  const database = data?.dependencies?.database;

  return (
    <>
      {isLoading && (
        <Loader2 className="mt-6 animate-spin text-white/30" size={20} />
      )}
      {(error || (data && !database)) && (
        <p className="mt-6 text-rose-300">{t("Status unavailable.")}</p>
      )}
      {database && (
        <dl className="mt-6 grid gap-4 sm:grid-cols-3">
          <StatusMetric label={t("Version")} value={database.version} />
          <StatusMetric
            label={t("Max connections")}
            value={database.max_connections}
          />
          <StatusMetric
            label={t("Open connections")}
            value={database.open_connections}
          />
        </dl>
      )}
    </>
  );
};

function StatusMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-4">
      <dt className="text-xs font-bold uppercase tracking-wider text-white/35">
        {label}
      </dt>
      <dd className="mt-2 text-lg font-bold text-white/80">{value}</dd>
    </div>
  );
}

export default StatusPage;

StatusPage.getLayout = function getLayout(page: React.ReactElement) {
  return <StoreHomeLayout>{page}</StoreHomeLayout>;
};
