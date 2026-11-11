import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlaceholderPage } from "@/components/placeholder-page";
import { NAV_ITEMS } from "@/lib/nav";

type PageProps = { params: Promise<{ secao: string }> };

function findItem(slug: string) {
  return NAV_ITEMS.find((item) => item.slug === slug && item.slug !== "kanban");
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { secao } = await params;
  const item = findItem(secao);
  return { title: item?.label ?? "Página não encontrada" };
}

export default async function SectionPage({ params }: PageProps) {
  const { secao } = await params;
  const item = findItem(secao);
  if (!item) notFound();

  return <PlaceholderPage item={item} />;
}
