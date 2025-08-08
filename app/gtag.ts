export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "";

export const pageview = (url: string) => {
  if (!GA_ID) return;
  // window.gtag は script 挿入後に定義される
  // @ts-ignore
  window.gtag("config", GA_ID, { page_path: url });
};
