/* Uploaded brand assets can come from the API or an administrator-approved CDN. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpRight, Eye, History, ImagePlus, MonitorUp, Radio, RotateCcw, Save, Trash2, Upload, X } from "lucide-react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { AlertBanner, useAlerts } from "../../components/alerts/AlertSystem";
import { defaultSiteConfig, useSiteConfig } from "../../components/site/SiteConfigProvider";
import { AnnouncementStrip } from "../../components/site/AnnouncementStrip";
import { api, resolveApiAssetUrl } from "../../lib/api";
import type { Event, SiteConfig, SiteConfigVersion, SiteHeroSlide } from "../../types";

const inputClass = "mt-2 w-full rounded-xl border border-black/15 bg-white px-3.5 py-3 text-sm font-semibold text-[#151515] outline-none transition focus:border-[#3155ff] focus:ring-4 focus:ring-[#3155ff]/10";

export default function PublicSiteEditorPage() {
  const { config, setConfig, realtimeConnected } = useSiteConfig();
  const { notify } = useAlerts();
  const [draft, setDraft] = useState<SiteConfig>(config);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [versions, setVersions] = useState<SiteConfigVersion[]>([]);
	const [events, setEvents] = useState<Event[]>([]);
  const [pendingRestore, setPendingRestore] = useState<SiteConfigVersion | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
		Promise.all([api.getSiteConfig(), api.listSiteConfigVersions(), api.listEvents({ limit: 100 })]).then(([settings, history, eventResult]) => { if (active) { setDraft({ ...defaultSiteConfig, ...settings }); setConfig({ ...defaultSiteConfig, ...settings }); setVersions(history); setEvents(eventResult.events.filter((event) => !["CANCELLED", "ARCHIVED"].includes(event.status))); } }).catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load public site settings.")).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [setConfig]);

  const update = <K extends keyof SiteConfig>(key: K, value: SiteConfig[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const updateSlide = (index: number, patch: Partial<SiteHeroSlide>) => update("hero_slides", draft.hero_slides.map((slide, itemIndex) => itemIndex === index ? { ...slide, ...patch } : slide));
  const moveSlide = (index: number, direction: -1 | 1) => {
    const destination = index + direction;
    if (destination < 0 || destination >= draft.hero_slides.length) return;
    const slides = [...draft.hero_slides];
    [slides[index], slides[destination]] = [slides[destination], slides[index]];
    update("hero_slides", slides);
  };

  const uploadAsset = async (file: File, target: "logo" | number) => {
    if (!file.type.match(/^image\/(jpeg|png|webp)$/) || file.size > 8 * 1024 * 1024) { setError("Use a JPG, PNG, or WebP image no larger than 8 MB."); return; }
    const key = target === "logo" ? "logo" : `slide-${target}`;
    try {
      setUploading(key); setError(null);
      const result = await api.uploadSiteAsset(file);
      if (target === "logo") update("logo_url", result.url); else updateSlide(target, { image_url: result.url });
      notify({ tone: "success", title: "Image ready", message: "The asset is uploaded. Save changes when the preview looks right." });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not upload this image."); }
    finally { setUploading(null); }
  };

  const save = async () => {
		if (draft.announcement_enabled && !draft.announcement_event_id) {
			setError("Choose which event this announcement belongs to before publishing it.");
			return;
		}
    try {
      setSaving(true); setError(null);
      const saved = await api.updateSiteConfig(draft);
      setDraft(saved); setConfig(saved);
      api.listSiteConfigVersions().then(setVersions).catch(() => undefined);
      notify({ tone: "success", title: "Public site updated", message: "The new identity and homepage content are now live." });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save public site settings."); }
    finally { setSaving(false); }
  };

	const selectAnnouncementEvent = (eventID: string) => {
		const selected = events.find((event) => event.id === eventID);
		setDraft((current) => ({
			...current,
			announcement_event_id: selected?.id || null,
			announcement_event_name: selected?.name || "",
			announcement_event_slug: selected?.slug || "",
		}));
	};

  const restoreVersion = async (version: SiteConfigVersion) => {
    try {
      setRestoring(version.id); setError(null);
      const restored = await api.restoreSiteConfigVersion(version.id);
      const next = { ...defaultSiteConfig, ...restored };
      setDraft(next); setConfig(next); setPendingRestore(null);
      api.listSiteConfigVersions().then(setVersions).catch(() => undefined);
      notify({ tone: "success", title: "Version restored", message: "The selected design is live, and the restore was saved as a new version." });
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not restore this public site version."); }
    finally { setRestoring(null); }
  };

  return (
    <AdminLayout title="Public site" subtitle="Control the club identity, homepage banner, carousel, colors, and public messaging" minRole="ADMIN" actions={<div className="flex items-center gap-2"><span title={realtimeConnected ? "Public pages receive published changes instantly" : "Realtime is reconnecting; saved changes remain safe"} className={`hidden items-center gap-2 rounded-full border px-3 py-2.5 text-[9px] font-black uppercase tracking-[0.1em] lg:inline-flex ${realtimeConnected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}><Radio className={`h-3.5 w-3.5 ${realtimeConnected ? "animate-pulse" : ""}`} />{realtimeConnected ? "Live sync" : "Reconnecting"}</span><Link href="/" target="_blank" className="hidden items-center gap-2 rounded-full border border-black/15 bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.1em] sm:inline-flex">Preview site <ArrowUpRight className="h-3.5 w-3.5" /></Link><button type="button" onClick={save} disabled={saving || loading} className="inline-flex items-center gap-2 rounded-full bg-[#151515] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-white disabled:opacity-40"><Save className="h-3.5 w-3.5" />{saving ? "Saving" : "Publish changes"}</button></div>}>
      {error && <AlertBanner tone="error" title="Customization needs attention" className="mb-6" onDismiss={() => setError(null)}>{error}</AlertBanner>}
      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-start">
        <div className="space-y-6">
          <EditorSection eyebrow="01 · Identity" title="Club brand" description="Change the public logo, club name, location label, and core color system.">
            <div className="grid gap-5 sm:grid-cols-2"><Field label="Club name"><input className={inputClass} value={draft.club_name} onChange={(e) => update("club_name", e.target.value)} maxLength={80} /></Field><Field label="Location label"><input className={inputClass} value={draft.location_label} onChange={(e) => update("location_label", e.target.value)} maxLength={80} /></Field></div>
            <AssetField label="Logo" value={draft.logo_url} uploading={uploading === "logo"} onChange={(value) => update("logo_url", value)} onFile={(file) => uploadAsset(file, "logo")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><ColorField label="Primary / signal" value={draft.primary_color} onChange={(value) => update("primary_color", value)} /><ColorField label="Accent / action" value={draft.accent_color} onChange={(value) => update("accent_color", value)} /><ColorField label="Public background" value={draft.background_color} onChange={(value) => update("background_color", value)} /></div>
          </EditorSection>

          <EditorSection eyebrow="02 · Banner" title="Announcement strip" description="Show a temporary message above the public navigation for launches, deadlines, or race-day notices.">
            <label className="flex items-center justify-between rounded-2xl border border-black/10 bg-[#f5f4ef] p-4"><span><span className="block text-xs font-black">Show announcement</span><span className="mt-1 block text-[10px] font-semibold text-black/45">Visible across public pages.</span></span><input type="checkbox" checked={draft.announcement_enabled} onChange={(e) => update("announcement_enabled", e.target.checked)} className="h-5 w-5 accent-[#3155ff]" /></label>
			<Field label="Event"><select className={inputClass} value={draft.announcement_event_id || ""} onChange={(e) => selectAnnouncementEvent(e.target.value)}><option value="">Choose the event this notice is about</option>{events.map((event) => <option key={event.id} value={event.id}>{event.name} · {event.status.replaceAll("_", " ")}</option>)}</select></Field>
			<Field label="Announcement detail"><input className={inputClass} value={draft.announcement_text} onChange={(e) => update("announcement_text", e.target.value)} maxLength={180} placeholder="Registration closes Friday at 8 PM" /><p className="mt-2 text-[10px] font-semibold leading-4 text-black/40">The event name is added automatically before this message.</p></Field>
			<Field label="Optional destination override"><input className={inputClass} value={draft.announcement_href} onChange={(e) => update("announcement_href", e.target.value)} placeholder="Leave empty to open the selected event" /></Field>
          </EditorSection>

          <EditorSection eyebrow="03 · Homepage" title="Hero and club story" description="Shape the main introduction, concise club story, primary action, and footer.">
            <Field label="Hero introduction"><textarea className={`${inputClass} min-h-24 resize-y`} value={draft.hero_intro} onChange={(e) => update("hero_intro", e.target.value)} maxLength={300} /></Field>
            <div className="grid gap-5 sm:grid-cols-2"><Field label="Large headline — line 1"><input className={inputClass} value={draft.hero_title_primary} onChange={(e) => update("hero_title_primary", e.target.value)} maxLength={40} /></Field><Field label="Large headline — line 2"><input className={inputClass} value={draft.hero_title_secondary} onChange={(e) => update("hero_title_secondary", e.target.value)} maxLength={40} /></Field></div>
            <Field label="Mission eyebrow"><input className={inputClass} value={draft.mission_eyebrow} onChange={(e) => update("mission_eyebrow", e.target.value)} /></Field>
            <Field label="Mission statement"><textarea className={`${inputClass} min-h-24 resize-y`} value={draft.mission_text} onChange={(e) => update("mission_text", e.target.value)} maxLength={500} /></Field>
            <Field label="Supporting statement"><textarea className={`${inputClass} min-h-20 resize-y`} value={draft.mission_supporting_text} onChange={(e) => update("mission_supporting_text", e.target.value)} maxLength={500} /></Field>
            <div className="grid gap-5 sm:grid-cols-2"><Field label="Primary button label"><input className={inputClass} value={draft.primary_cta_label} onChange={(e) => update("primary_cta_label", e.target.value)} /></Field><Field label="Primary button destination"><input className={inputClass} value={draft.primary_cta_href} onChange={(e) => update("primary_cta_href", e.target.value)} /></Field></div>
            <Field label="Footer text"><input className={inputClass} value={draft.footer_text} onChange={(e) => update("footer_text", e.target.value)} maxLength={160} /></Field>
          </EditorSection>

          <EditorSection eyebrow="04 · Carousel" title="Hero images" description="Upload and reorder the visual stories that lead the homepage. One to six slides are supported.">
            <div className="space-y-4">{draft.hero_slides.map((slide, index) => <SlideEditor key={index} index={index} slide={slide} uploading={uploading === `slide-${index}`} onChange={(patch) => updateSlide(index, patch)} onUpload={(file) => uploadAsset(file, index)} onRemove={() => update("hero_slides", draft.hero_slides.filter((_, itemIndex) => itemIndex !== index))} onMoveUp={() => moveSlide(index, -1)} onMoveDown={() => moveSlide(index, 1)} canMoveUp={index > 0} canMoveDown={index < draft.hero_slides.length - 1} canRemove={draft.hero_slides.length > 1} />)}</div>
            {draft.hero_slides.length < 6 && <button type="button" onClick={() => update("hero_slides", [...draft.hero_slides, { image_url: "/images/club/riverside-run.jpg", alt: "Run club hero image", eyebrow: "New story", title: "New slide", copy: "Add the story behind this image." }])} className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#151515] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-white"><ImagePlus className="h-3.5 w-3.5" />Add slide</button>}
          </EditorSection>
        </div>
        <div className="space-y-5 xl:sticky xl:top-[112px]">
          <LivePreview config={draft} />
          <VersionHistory versions={versions} restoring={restoring} onRestore={setPendingRestore} />
        </div>
      </div>
      {pendingRestore && <RestoreDialog version={pendingRestore} busy={restoring === pendingRestore.id} onCancel={() => setPendingRestore(null)} onConfirm={() => restoreVersion(pendingRestore)} />}
    </AdminLayout>
  );
}

function EditorSection({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) { return <section className="rounded-[24px] border border-black/10 bg-white p-5 shadow-sm sm:p-7"><p className="font-mono text-[9px] font-black uppercase tracking-[0.18em] text-[#3155ff]">{eyebrow}</p><h2 className="mt-2 text-xl font-black tracking-[-0.03em]">{title}</h2><p className="mt-2 max-w-2xl text-xs font-semibold leading-5 text-black/45">{description}</p><div className="mt-6 space-y-5">{children}</div></section>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="text-[10px] font-black uppercase tracking-[0.13em] text-black/50">{label}</span>{children}</label>; }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <Field label={label}><div className="mt-2 flex items-center gap-2 rounded-xl border border-black/15 bg-white p-2"><input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer border-0 bg-transparent" /><input value={value} onChange={(e) => onChange(e.target.value)} pattern="#[0-9a-fA-F]{6}" className="min-w-0 flex-1 font-mono text-xs font-bold uppercase outline-none" /></div></Field>; }
function AssetField({ label, value, uploading, onChange, onFile }: { label: string; value: string; uploading: boolean; onChange: (value: string) => void; onFile: (file: File) => void }) { const choose = (e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) onFile(file); e.target.value = ""; }; return <div><p className="text-[10px] font-black uppercase tracking-[0.13em] text-black/50">{label}</p><div className="mt-2 grid gap-3 sm:grid-cols-[96px_minmax(0,1fr)]"><div className="grid h-24 place-items-center overflow-hidden rounded-2xl bg-[#151515]">{value ? <img src={resolveApiAssetUrl(value)} alt="Brand asset preview" className="h-full w-full object-contain" /> : <Upload className="h-5 w-5 text-white/30" />}</div><div><input className={`${inputClass} mt-0`} value={value} onChange={(e) => onChange(e.target.value)} placeholder="/uploads/site/… or https://…" /><label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-full border border-black/15 px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.1em]"><Upload className="h-3.5 w-3.5" />{uploading ? "Uploading" : "Upload image"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} disabled={uploading} className="sr-only" /></label></div></div></div>; }
function SlideEditor({ index, slide, uploading, onChange, onUpload, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown, canRemove }: { index: number; slide: SiteHeroSlide; uploading: boolean; onChange: (patch: Partial<SiteHeroSlide>) => void; onUpload: (file: File) => void; onRemove: () => void; onMoveUp: () => void; onMoveDown: () => void; canMoveUp: boolean; canMoveDown: boolean; canRemove: boolean }) { return <article className="rounded-2xl border border-black/10 bg-[#f7f6f1] p-4"><div className="mb-4 flex items-center justify-between"><p className="font-mono text-[9px] font-black uppercase tracking-[0.15em] text-black/45">Slide {String(index + 1).padStart(2, "0")}</p><div className="flex items-center gap-1"><button type="button" disabled={!canMoveUp} onClick={onMoveUp} className="grid h-8 w-8 place-items-center rounded-lg text-black/35 hover:bg-black/5 hover:text-black disabled:opacity-15" aria-label={`Move slide ${index + 1} up`}><ArrowUp className="h-3.5 w-3.5" /></button><button type="button" disabled={!canMoveDown} onClick={onMoveDown} className="grid h-8 w-8 place-items-center rounded-lg text-black/35 hover:bg-black/5 hover:text-black disabled:opacity-15" aria-label={`Move slide ${index + 1} down`}><ArrowDown className="h-3.5 w-3.5" /></button><button type="button" disabled={!canRemove} onClick={onRemove} className="grid h-8 w-8 place-items-center rounded-lg text-black/30 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-20" aria-label={`Remove slide ${index + 1}`}><Trash2 className="h-4 w-4" /></button></div></div><AssetField label="Image" value={slide.image_url} uploading={uploading} onChange={(image_url) => onChange({ image_url })} onFile={onUpload} /><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Eyebrow"><input className={inputClass} value={slide.eyebrow} onChange={(e) => onChange({ eyebrow: e.target.value })} /></Field><Field label="Title"><input className={inputClass} value={slide.title} onChange={(e) => onChange({ title: e.target.value })} /></Field></div><Field label="Description"><textarea className={`${inputClass} min-h-20 resize-y`} value={slide.copy} onChange={(e) => onChange({ copy: e.target.value })} /></Field><Field label="Accessible image description"><input className={inputClass} value={slide.alt} onChange={(e) => onChange({ alt: e.target.value })} /></Field></article>; }

function VersionHistory({ versions, restoring, onRestore }: { versions: SiteConfigVersion[]; restoring: number | null; onRestore: (version: SiteConfigVersion) => void }) {
  return <section className="overflow-hidden rounded-[24px] border border-black/10 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-black/10 px-5 py-4"><div><p className="flex items-center gap-2 font-mono text-[9px] font-black uppercase tracking-[0.17em] text-[#3155ff]"><History className="h-3.5 w-3.5" />Version ledger</p><p className="mt-1 text-[10px] font-semibold text-black/40">Every publish is recoverable.</p></div><span className="font-mono text-[9px] font-black text-black/30">{versions.length}</span></div><div className="max-h-[330px] overflow-y-auto">{versions.length === 0 ? <p className="px-5 py-7 text-xs font-semibold text-black/40">Publish once to begin the design history.</p> : versions.map((version, index) => <article key={version.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-black/[0.07] px-5 py-4 last:border-0"><div className="min-w-0"><div className="flex items-center gap-2"><span className="font-mono text-[9px] font-black uppercase tracking-[0.12em] text-black/35">V{String(version.id).padStart(4, "0")}</span>{index === 0 && <span className="rounded-full bg-[#d9ff00] px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-black">Live</span>}</div><p className="mt-1 truncate text-xs font-black">{version.settings.hero_title_primary} {version.settings.hero_title_secondary}</p><p className="mt-1 truncate font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-black/35">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(version.created_at))} · {version.created_by || "System baseline"}</p><div className="mt-2 flex gap-1.5" aria-label="Version colors"><span className="h-2.5 w-7 rounded-full" style={{ backgroundColor: version.settings.primary_color }} /><span className="h-2.5 w-7 rounded-full" style={{ backgroundColor: version.settings.accent_color }} /><span className="h-2.5 w-7 rounded-full border border-black/10" style={{ backgroundColor: version.settings.background_color }} /></div></div><button type="button" disabled={index === 0 || restoring !== null} onClick={() => onRestore(version)} className="mt-1 grid h-9 w-9 place-items-center rounded-full border border-black/10 text-black/35 transition hover:border-black hover:text-black disabled:opacity-20" aria-label={index === 0 ? "Current live version" : `Restore version ${version.id}`}><RotateCcw className={`h-3.5 w-3.5 ${restoring === version.id ? "animate-spin" : ""}`} /></button></article>)}</div></section>;
}

function RestoreDialog({ version, busy, onCancel, onConfirm }: { version: SiteConfigVersion; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/65 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="restore-version-title"><div className="w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-2xl"><div className="flex items-start justify-between border-b border-black/10 p-6"><div><p className="font-mono text-[9px] font-black uppercase tracking-[0.17em] text-[#3155ff]">Restore point · V{String(version.id).padStart(4, "0")}</p><h2 id="restore-version-title" className="mt-2 text-xl font-black tracking-[-0.03em]">Make this design live?</h2></div><button type="button" onClick={onCancel} disabled={busy} className="grid h-9 w-9 place-items-center rounded-full border border-black/10 text-black/40 hover:text-black" aria-label="Cancel restore"><X className="h-4 w-4" /></button></div><div className="p-6"><div className="rounded-2xl p-5 text-white" style={{ backgroundColor: version.settings.background_color }}><p className="font-mono text-[8px] font-black uppercase tracking-[0.15em]" style={{ color: version.settings.primary_color }}>{version.settings.club_name}</p><p className="sport-display mt-5 text-5xl uppercase leading-[0.78]" style={{ color: version.settings.primary_color }}>{version.settings.hero_title_primary}</p><p className="sport-display mt-1 text-3xl uppercase text-white/40">{version.settings.hero_title_secondary}</p></div><p className="mt-5 text-xs font-semibold leading-5 text-black/50">This replaces any unsaved fields in the editor. The current live design stays in history, and this restore becomes a new version.</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onCancel} disabled={busy} className="rounded-full border border-black/15 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.1em]">Keep current</button><button type="button" onClick={onConfirm} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-[#151515] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-white disabled:opacity-50"><RotateCcw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />{busy ? "Restoring" : "Restore version"}</button></div></div></div></div>;
}

function LivePreview({ config }: { config: SiteConfig }) { const slide = config.hero_slides[0]; const announcement = config.announcement_event_name ? `${config.announcement_event_name} — ${config.announcement_text}` : config.announcement_text || "Announcement preview"; return <aside><div className="overflow-hidden rounded-[28px] border border-black/10 bg-[#151515] shadow-xl"><div className="flex items-center justify-between border-b border-white/10 px-5 py-4 text-white"><span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.15em]"><Eye className="h-3.5 w-3.5" />Live direction</span><MonitorUp className="h-4 w-4 text-white/35" /></div>{config.announcement_enabled && <AnnouncementStrip message={announcement} color={config.primary_color} compact interactive={false} />}<div className="flex items-center gap-3 border-b border-white/10 p-4 text-white"><span className="grid h-10 w-10 place-items-center overflow-hidden" style={{ backgroundColor: config.primary_color }}>{config.logo_url && <img src={resolveApiAssetUrl(config.logo_url)} alt="" className="h-full w-full object-contain" />}</span><div><p className="text-[7px] font-black uppercase tracking-[0.18em]" style={{ color: config.primary_color }}>{config.location_label}</p><p className="sport-display mt-1 text-lg uppercase leading-none">{config.club_name}</p></div></div><div className="relative min-h-[430px] overflow-hidden p-6 text-white" style={{ backgroundColor: config.background_color }}>{slide && <><img src={resolveApiAssetUrl(slide.image_url)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" /><div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" /></>}<div className="relative flex min-h-[382px] flex-col"><p className="max-w-[250px] text-[8px] font-black uppercase leading-4 tracking-[0.13em]" style={{ color: config.primary_color }}>{config.hero_intro}</p><div className="mt-auto"><p className="text-[8px] font-black uppercase tracking-[0.14em]" style={{ color: config.primary_color }}>{slide?.eyebrow}</p><p className="sport-display mt-4 text-6xl uppercase leading-[0.72]" style={{ color: config.primary_color }}>{config.hero_title_primary}</p><p className="sport-display mt-2 text-4xl uppercase leading-none text-white/35">{config.hero_title_secondary}</p><span className="mt-5 inline-flex rounded-full px-4 py-2 text-[9px] font-black uppercase text-black" style={{ backgroundColor: config.primary_color }}>{config.primary_cta_label}</span></div></div></div></div><p className="mt-4 px-2 text-[10px] font-semibold leading-5 text-black/40">Preview represents the first hero slide. Open the public site to review full carousel motion and responsive layouts.</p></aside>; }
