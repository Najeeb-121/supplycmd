import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import CompanyAdminPage from "../../pages/company-admin";

const mockCreateInvitation = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: {
      id: 1,
      name: "Hasan Owner",
      email: "owner@pepsico.example",
      role: "owner",
      companyId: 1,
      companyName: "Pepsico",
    },
  }),
}));

vi.mock("@workspace/api-client-react", () => ({
  useListCompanyUsers: () => ({
    data: [
      {
        id: 1,
        name: "Hasan Owner",
        email: "owner@pepsico.example",
        role: "owner",
      },
      {
        id: 2,
        name: "Admin User",
        email: "admin@pepsico.example",
        role: "admin",
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useListCompanyInvitations: () => ({
    data: [
      {
        id: 7,
        email: "member@pepsico.example",
        role: "member",
        expiresAt: "2099-09-15T12:00:00.000Z",
        acceptedAt: null,
        createdAt: "2026-09-09T12:00:00.000Z",
      },
    ],
    isLoading: false,
    isError: false,
  }),
  useCreateCompanyInvitation: () => ({
    mutate: mockCreateInvitation,
    isPending: false,
    isError: false,
  }),
  getListCompanyInvitationsQueryKey: () => ["/api/company/invitations"],
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <CompanyAdminPage />
    </QueryClientProvider>,
  );
}

describe("Company Administration page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows only the company users and invitations returned by the tenant-scoped API", () => {
    renderPage();

    expect(screen.getAllByText("Hasan Owner")).toHaveLength(2);
    expect(screen.getByText("admin@pepsico.example")).toBeInTheDocument();
    expect(screen.getByText("member@pepsico.example")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("keeps invitation creation disabled until an email is entered", () => {
    renderPage();

    expect(
      screen.getByRole("button", { name: /create invitation/i }),
    ).toBeDisabled();
  });

  it("submits only the invitation email and selected role", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(
      screen.getByPlaceholderText("user@example.com"),
      "newuser@pepsico.example",
    );

    await user.click(
      screen.getByRole("button", { name: /create invitation/i }),
    );

    expect(mockCreateInvitation).toHaveBeenCalledTimes(1);
    expect(mockCreateInvitation).toHaveBeenCalledWith(
      {
        data: {
          email: "newuser@pepsico.example",
          role: "member",
        },
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
      }),
    );
  });
});