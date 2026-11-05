export function utmFromQuery(query: URLSearchParams): Record<string, string> {
  const fields: Record<string, string> = {
    source: "utm_source",
    medium: "utm_medium",
    campaign: "utm_campaign",
    content: "utm_content",
    keyword: "utm_term",
    adGroup: "utm_ad_group",
    customTracking: "utm_custom_tracking",
  };
  return Object.fromEntries(
    Object.entries(fields).flatMap(([field, param]) => {
      const value = query.get(param);
      return value ? [[field, value]] : [];
    })
  );
}
