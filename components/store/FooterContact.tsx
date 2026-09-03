import { IconMail } from "@tabler/icons-react";
import { useI18n } from "lib/i18n";

const CONTACT_EMAIL = "pedro@manifoldpowered.com";

export function FooterContact() {
  const { t } = useI18n();

  return (
    <div className="lg:col-span-2 flex flex-col gap-6">
      <h4 className="text-white text-xs font-black uppercase tracking-[0.2em] mb-2 px-2">
        {t("Contact")}
      </h4>
      <div className="px-2 flex flex-col items-start gap-4">
        <p className="text-white/40 text-sm leading-relaxed">
          {t("Have a question or want to talk about Manifold?")}
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          aria-label={t("Email Pedro Mello")}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-black text-white transition-all hover:bg-indigo-400 hover:shadow-lg hover:shadow-indigo-500/20"
        >
          <IconMail size={18} aria-hidden="true" />
          {t("Get in touch")}
        </a>
      </div>
    </div>
  );
}
