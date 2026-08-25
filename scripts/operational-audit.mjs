import fs from 'node:fs';

const checks = [
  ['custom checkout stays native', 'app/(tabs)/(more)/custom-request/[id].tsx', s => s.includes('ensureProduct') && !s.includes('openBrowserAsync(checkoutUrl)')],
  ['payout failures are not shown as zero', 'app/(tabs)/(more)/seller/payouts.tsx', s => s.includes('Balance unavailable') && s.includes("We won't show $0.00")],
  ['payout model is request based', 'app/(tabs)/(more)/seller/bank.tsx', s => s.includes('request a payout')],
  ['checkout confirmation copy is accurate', 'app/(tabs)/(more)/cart.tsx', s => s.includes('Payment received! Your order is confirmed') && !s.includes('Your order is on its way')],
  ['dead alert Open buttons are suppressed', 'app/(tabs)/(more)/alerts.tsx', s => s.includes('targetRoute !== "/alerts"')],
  ['seller application notifications route', 'src/hooks/use-notification-routing.ts', s => s.includes('case "seller_application_update"') && s.includes('return "/seller/apply"')],
  ['refund and dispute are de-duplicated', 'app/(tabs)/(more)/disputes/new.tsx', s => s.includes('A buyer-protection case is already open') && s.includes('Start with the refund request')],
  ['dispute evidence is uploaded', 'app/(tabs)/(more)/disputes/new.tsx', s => s.includes('uploadEvidence') && s.includes('evidence: evidenceUrls')],
  ['seller fulfillment transitions are constrained', 'app/(tabs)/(more)/order/[id].tsx', s => s.includes('allowedSellerStatuses') && !s.includes('const SELLER_STATUSES')],
  ['shipping accounting respects platform flag', 'app/(tabs)/(more)/order/[id].tsx', s => s.includes('platformKeepsShipping') && s.includes('will not reduce your seller payout')],
  ['admin operational queues exist', 'app/(tabs)/(more)/admin/operations.tsx', s => s.includes('Order exceptions') && s.includes('Buyer-protection cases')],
  ['merchant id is centralized', 'src/context/StripePayment.tsx', s => s.includes('stripeMerchantIdentifier') && !s.includes('TODO: Replace with the real Apple merchant ID')],
];

let failed = 0;
for (const [name, file, test] of checks) {
  const text = fs.readFileSync(file, 'utf8');
  const ok = test(text);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
if (failed) {
  console.error(`\n${failed} operational regression check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} operational regression checks passed.`);
