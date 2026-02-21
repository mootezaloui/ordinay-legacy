type LinkSource =
  | "agent_source"
  | "markdown_link"
  | "activation"
  | "settings_plan"
  | "unknown";

export async function openExternalLink(url: string, _source: LinkSource = "unknown"): Promise<boolean> {
  void _source;
  try {
    if (window.electronAPI?.openExternalWebUrl) {
      const result = await window.electronAPI.openExternalWebUrl(url);
      return !!result?.ok;
    }

    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    window.open(parsed.toString(), "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

export async function openExternalMailto(url: string): Promise<boolean> {
  try {
    if (window.electronAPI?.openExternalMailto) {
      const result = await window.electronAPI.openExternalMailto(url);
      return !!result?.ok;
    }
    if (!url.toLowerCase().startsWith("mailto:")) return false;
    window.location.href = url;
    return true;
  } catch {
    return false;
  }
}
