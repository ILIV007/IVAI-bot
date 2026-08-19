# IVAI Admin UI Review

**Preview reviewed:** 19 August 2026

The local data-backed preview confirms that the English-first admin dashboard renders a coherent dark, space-themed interface. At desktop width, the header, verification state, three operational metrics, and two-column quick-action grid are visible, readable, and aligned. The primary broadcast action is visually distinct and all buttons provide at least 44px touch height.

The source uses a mobile-first layout and an explicit `@media (max-width: 420px)` breakpoint. At this breakpoint, metric cards and quick actions become a single column, the header can stack safely, and horizontal padding is reduced. The design also respects Telegram safe-area insets, provides visible keyboard focus rings, and switches RTL/LTR only when Persian is explicitly selected. Because the preview runs outside Telegram, server-validated data and Telegram theme parameters remain subject to deployed-device verification.
