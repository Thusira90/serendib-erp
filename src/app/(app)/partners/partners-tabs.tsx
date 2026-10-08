"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function PartnersTabs({
  defaultTab, partnerCount, dealCount, partners, deals,
}: {
  defaultTab: "partners" | "deals";
  partnerCount: number;
  dealCount: number;
  partners: React.ReactNode;
  deals: React.ReactNode;
}) {
  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList>
        <TabsTrigger value="partners">Partners ({partnerCount})</TabsTrigger>
        <TabsTrigger value="deals">Deals ({dealCount})</TabsTrigger>
      </TabsList>
      <TabsContent value="partners">{partners}</TabsContent>
      <TabsContent value="deals">{deals}</TabsContent>
    </Tabs>
  );
}
