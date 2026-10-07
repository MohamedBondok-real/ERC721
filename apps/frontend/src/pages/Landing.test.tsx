import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DEMO_DATA_BANNER, MEDICAL_DISCLAIMER, NUTRITION_DISCLAIMER, RISK_ASSESSMENT_DISCLAIMER } from "@breastcare/shared";
import { ThemeProvider } from "@/context/ThemeContext";
import { Landing } from "./Landing";

function renderLanding() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe("Landing page", () => {
  it("shows the exact hero headline and subheading", () => {
    renderLanding();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Smarter Breast Cancer Care Through Data, Nutrition & Secure Technology",
      }),
    ).toBeInTheDocument();

    expect(screen.getByText(/brings breast cancer awareness, educational risk assessment/i)).toBeInTheDocument();
  });

  it("offers both Get Started and Explore Platform entry points", () => {
    renderLanding();

    // "Get Started" appears in the header nav and in the hero; both must lead to registration.
    const started = screen.getAllByRole("link", { name: /get started/i });
    expect(started.length).toBeGreaterThan(0);
    for (const link of started) expect(link).toHaveAttribute("href", "/register");

    expect(screen.getByRole("link", { name: /explore platform/i })).toHaveAttribute("href", "/login");
  });

  it("presents the clinical-decision-support positioning, not a diagnostic claim", () => {
    renderLanding();

    expect(screen.getByText(/clinical decision support · not a diagnostic device/i)).toBeInTheDocument();

    // The phrase may only ever appear negated — never as an assertion about the reader.
    const mentions = screen.getAllByText(/you have breast cancer/i);
    for (const mention of mentions) {
      expect(mention.textContent?.toLowerCase()).toMatch(/never|not|does not|doesn't/);
    }
  });

  it("covers every required feature section", () => {
    renderLanding();

    for (const heading of [
      "Risk Awareness",
      "Nutrition Guidance",
      "Treatment Tracking",
      "Patient Monitoring",
      "Secure Records",
      "Blockchain Integrity",
      "Doctor Collaboration",
      "AI Insights",
    ]) {
      expect(screen.getByRole("heading", { name: new RegExp(heading, "i") })).toBeInTheDocument();
    }
  });

  it("carries the medical, risk and nutrition disclaimers verbatim", () => {
    renderLanding();

    expect(screen.getByText(MEDICAL_DISCLAIMER)).toBeInTheDocument();
    expect(screen.getByText(RISK_ASSESSMENT_DISCLAIMER)).toBeInTheDocument();
    expect(screen.getByText(NUTRITION_DISCLAIMER)).toBeInTheDocument();
  });

  it("labels the whole page as fictional demo data", () => {
    renderLanding();

    // The footer renders the label and the banner inside one paragraph, so assert on its text.
    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).toContain(DEMO_DATA_BANNER);
    expect(footer.textContent).toMatch(/educational and clinical decision support/i);
  });
});
