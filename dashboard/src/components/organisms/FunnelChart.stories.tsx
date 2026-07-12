import type { Meta, StoryObj } from "@storybook/react";
import { FunnelChart } from "./FunnelChart.js";

const meta: Meta<typeof FunnelChart> = {
  title: "Organisms/FunnelChart",
  component: FunnelChart,
};
export default meta;
type Story = StoryObj<typeof FunnelChart>;

export const CheckoutFunnel: Story = {
  args: {
    steps: [
      { event: "product_viewed",     users: 42000, conversionFromStart: 1,     medianTimeToNextS: 95 },
      { event: "cart_added",         users: 11800, conversionFromStart: 0.281, medianTimeToNextS: 210 },
      { event: "checkout_started",   users: 6100,  conversionFromStart: 0.145, medianTimeToNextS: 46 },
      { event: "checkout_completed", users: 3900,  conversionFromStart: 0.093 },
    ],
  },
};
