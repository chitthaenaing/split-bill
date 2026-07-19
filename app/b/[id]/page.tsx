import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { toPublicStoredBill } from "@/lib/public-bill";
import { getShare } from "@/lib/share";
import { SharedBill } from "./shared-bill";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Shared bill · Bill Split`,
    description: "Pick the items you had and see what you owe.",
    robots: { index: false, follow: false },
    openGraph: {
      title: "A bill was shared with you",
      description: "Pick the items you had and see what you owe.",
      url: `/b/${id}`,
    },
  };
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getShare(id);
  if (!data) notFound();
  return <SharedBill data={toPublicStoredBill(data)} />;
}
