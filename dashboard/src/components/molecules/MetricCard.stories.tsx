import type { Meta, StoryObj } from "@storybook/react";
import { MetricCard } from "./MetricCard.js";

const meta: Meta<typeof MetricCard> = {
  title: "Molecules/MetricCard",
  component: MetricCard,
  parameters: { layout: "centered" },
};
export default meta;
type Story = StoryObj<typeof MetricCard>;

export const Default: Story = {
  args: { label: "Weekly Active Users", value: 12873, delta: 0.062 },
};

export const Negative: Story = {
  args: { label: "Signup Conversion", value: 0.183, format: "percent", delta: -0.041 },
};

export const ChurnInverted: Story = {
  args: { label: "Churn Rate", value: 0.034, format: "percent", delta: -0.008, invertDelta: true },
};

export const Loading: Story = {
  args: { label: "Revenue", value: 0, format: "currency", loading: true },
};
