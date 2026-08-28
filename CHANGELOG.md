# Changelog

All notable QuickEngine changes will be documented here.

This project is pre-release. Until QuickEngine has real users and a stable release process, changelog entries are maintained manually.

## [Unreleased]

### Added

- **Everyone finds out what happened.** Several things could happen to an order and reach nobody. A
  customer whose money went back was never told, and saw an unexplained refund on their statement days
  later. A supplier whose order was cancelled was never told, so they could make and ship goods for a
  sale that no longer existed, having already had their payment reversed. A subscriber whose card was
  declined was never asked to update it, so their subscription quietly lapsed. And you were not
  emailed when an order came in, when a refund went out, when a customer wrote to you, when a parcel
  shipped or arrived, or when a supplier could not be paid.

  All of those now send. What you are told about is separate from what your customers and suppliers
  are told about, and the messages to them still come from your business rather than from us.


### Fixed

- **Your own email wording now reaches your customers.** Rewriting an email in settings changed the
  preview and the test message you sent yourself, and nothing else, so every real customer kept
  receiving the built-in wording. Your version is now used for the real thing. What you bought and
  what you paid is still generated from the order itself, so a receipt can never disagree with the
  charge.


### Fixed

- **One order, one confirmation email.** A supplier who had not finished connecting the account they
  get paid into caused a paid order to be retried again and again, and the customer received their
  order confirmation on every attempt. Supplier payment is now retried on its own, quietly, without
  making anything else happen twice.

- **A supplier still gets paid if they finish setting up later.** Payment for an order used to be
  attempted a fixed number of times and then abandoned, so a supplier who connected their account a
  few days after the sale would never have been paid for it. What is owed is now revisited regularly
  until it settles, however long that takes.


### Added

- **Rehearse a real order with a supplier who has agreed to it.** Sandbox deliberately never sends
  anything to a supplier, because nothing downstream can tell a rehearsal from a real order and a
  supplier could end up shipping goods for a sale that never happened. You can now let one specific
  supplier receive sandbox orders, so you can prove the whole flow together before going live. It is
  off for every supplier until you turn it on, it applies to that supplier alone, and what they
  receive says clearly in its subject and its first line that it is a test and must not be fulfilled.


### Fixed

- **The currency you set is the currency your workspace uses.** Each part of the product kept its own
  idea of which money you deal in, all of them starting at US dollars, and the setting only changed
  one of them. That was not just a display problem: a supplier cost saved in a currency your product
  does not share is skipped rather than converted, so that supplier would never have been paid and
  nothing would have said why. Supplier costs now take the workspace's own currency unless you name a
  different one deliberately.


### Added

- **A rehearsal that proves supplier payments against the real payment provider.** The existing tests
  prove the logic by standing in for the provider, which cannot catch something the provider itself
  would reject. An opt-in rehearsal now runs the whole path for real in test mode: a paid order pays
  its supplier, the same order arriving three times pays them once, the supplier's own statement
  names the business and the order, and a refund pulls the money back. It is skipped unless
  deliberately switched on, so ordinary test runs never depend on the provider being reachable.


- **Take a verified backup of your database.** `pnpm db:backup --out <directory>` writes a compressed
  dump, then reads it back and refuses to keep one it cannot open, so a backup can never quietly be
  unusable. It writes only what QuickEngine owns rather than anything the hosting provider keeps
  alongside it, which is what lets the same file be restored somewhere else entirely. Old backups are
  pruned only after a new one has been written and checked, and files are readable only by the person
  who took them.


### Fixed

- **Works behind a shared connection pooler.** Some hosted Postgres providers put a
  transaction-mode pooler in front of the database, where a saved query plan cannot be relied on
  between statements. QuickEngine now notices when it is talking to one and stops reusing plans,
  which prevents intermittent database errors that would otherwise only appear once a site got busy
  enough for connections to be shared. Direct connections are unchanged and keep the faster path.


- **A refund takes the supplier's share back too.** Your supplier is paid the moment an order is
  paid, so refunding that customer afterwards left you out of pocket by whatever the supplier had
  already been sent, with nothing anywhere explaining where the money went. Refunding now pulls the
  supplier's share back automatically, in proportion to what you gave back, and never more than was
  sent. If their money has already reached their bank and cannot be recovered, you are told that
  plainly instead of it looking like it worked.


- **Suppliers actually get paid now.** Money was being set aside from every sale for the supplier who
  ships it, exactly as intended, and then nothing sent it on. The step that hands it over existed but
  was never connected to anything, so a paid order left the supplier's share sitting with us instead
  of reaching them. A paid order now settles its supplier by itself, once, and an order redelivered
  by our own retries still pays them exactly once.


- **The website preview only ever loads a website.** The address the content preview points at is
  typed in by hand, and nothing checked that it was a web address at all. Something that merely
  looked like one could have been left in a workspace's settings and then run code against the next
  person who opened the preview, inside QuickDash rather than inside the previewed site. Only
  `http://` and `https://` addresses are loaded now, and anything else says so plainly instead of
  being opened.


### Added

- **Invite a supplier to get paid automatically.** There was no way to record where a supplier's
  money should go, so nothing could ever be sent to them however well the rest worked. You can now
  send a supplier a link that connects the account they get paid into. They verify their own identity
  with the payment provider and hold their own account, so their bank details, tax id and documents
  never pass through QuickEngine. Sending the link again to somebody who started but did not finish
  picks up where they left off rather than starting a second account. Your sandbox and your live
  business keep separate supplier accounts, so a rehearsal can never pay a real supplier.


- **Pay your suppliers automatically when an order is paid.** A shop that has someone else ship its
  goods owes that supplier for every sale, and until now settling up was a manual job: work out what
  is owed, send an invoice or a transfer by hand, remember which orders you have already covered. The
  money is now set aside the moment the customer pays and sent on to the supplier by itself. Your
  customer's payment still lands in your own account, on your own statement, under your own name, and
  the supplier's share simply passes through on its way to them.

  What the supplier sees is your business and your order number, not ours. Nothing is ever sent
  twice: each purchase order can settle exactly once, and a payment interrupted halfway is picked up
  where it stopped rather than repeated. If a sale is refunded, the supplier's share is pulled back
  automatically while it is still recoverable, and told to you plainly when it is not.

  A shop that holds its own stock is unaffected, and so is an order with nothing dropshipped on it.
  Where a supplier prices in a different currency than the sale, or the goods cost more than the
  customer paid, the sale goes through untouched and the amount owed is left for you to settle by
  hand rather than guessed at.


- **Checkout shows the price you will actually pay.** Tax depends on your workspace settings and on
  where the parcel is going, so a shop's website had no way to work it out — it added up what it
  could see, called that the total, and then charged more. Checkout can now ask for a real price
  before anything is committed, and it comes back with the tax and the true total. Nothing is
  reserved or charged by asking, so a shop can re-price a basket as often as a customer changes it.


- **Disconnect a payment provider.** There was no way to undo connecting one, and setting up a new
  connection refuses while an old one is present, so a business whose connection stopped working was
  stuck with it. Payments now has a Disconnect button. It forgets our record only: your account at
  the provider is untouched, your money and history stay where they are, and past payments still
  refund through the account they were taken on.


- **Charge sales tax.** Your tax rate has been applied to every order since the beginning and there
  was no screen anywhere to set it, so it sat at zero — which means a business in a place that
  charges tax collected none of it, and unremitted tax comes out of the owner's pocket months later.
  Settings now takes it as a plain percentage, tells you in words what it will add before you save,
  and refuses anything that is not a real rate. Order numbering, currency and whether a paid order
  confirms itself are on the same screen, along with your low-stock warning level and whether stock
  may go below zero.


- **Test your whole shop, then go live, without reconnecting anything.** Sandbox exists so you can
  rehearse the real thing — take fake payments, place fake orders, break it, fix it — before asking a
  customer or a supplier to send real money. Until now the one part that could not follow you across
  that switch was the payment connection itself: a workspace could hold a single connection for its
  whole life, stamped with whichever mode it happened to be set up in, and switching afterwards left
  you unable to reconnect at all. A workspace now keeps a sandbox connection and a live one side by
  side, each with its own default, and flipping the switch changes which one takes the money. Neither
  can see the other's.

- **Activity: who changed what, and when.** Every change to an order, a payment, your stock or your
  catalog has always been recorded — and until now nothing could show it to you. The record names the
  person rather than an id, says where the change came from, and can pull up everything that happened
  in a single action at once, because one click on a busy page writes several entries and reading
  them apart tells you nothing. Nothing on it is written by hand and nothing can be edited.


- **Change how a module works for your business.** Every module carries settings — the prefix on your
  order numbers, whether stock may go below zero, where your parcels ship from — and until now none of
  them could be changed after a workspace was created. They can be saved now, and the first screen for
  it is the shipping one below.

- **Say where you ship from.** A carrier cannot price a parcel without knowing where it starts, so
  Shipping now takes your business address and the size of the box you usually ship in. Leave both
  empty if you price delivery with your own rates and never call a carrier.

- **Real carrier prices at checkout.** A delivery zone can now ask a carrier what it actually costs to
  send this parcel to this address, instead of using the bands you wrote by hand. It is chosen **per
  zone**, so you decide where it applies, and the carrier account is yours rather than ours: your
  negotiated rates come with you. Connect it once and the connection is checked before anything relies
  on it.

  🔴 **A zone set to ask a carrier never quietly falls back to your bands.** If the carrier cannot
  answer, checkout says delivery cannot be priced right now. Free delivery is something you choose,
  never something an outage decides for you.

- **A subscription actually charges.** Renewals have been scheduled and priced correctly for a
  while, but nothing ever took the money, so every subscription in existence renewed for free. A
  customer's card is now kept on file when they first pay, with their agreement, and each renewal is
  charged against it without them having to be there. A renewal that fails is retried and the
  subscription goes past due before it is ever cancelled, so one declined card does not end a
  customer relationship.

- **Your emails come from you.** A workspace can set the address its customer emails are sent from,
  so a receipt from a coffee company arrives from the coffee company rather than from QuickEngine.
  Until the address is verified with the mail provider, sending falls back rather than failing, and
  the settings screen says which state it is in.

- **Write your own customer emails.** Every customer-facing email can now be edited as a whole
  document, HTML and CSS together, including the surrounding shell. A preview shows the real thing
  with realistic contents, and a test send puts it in your own inbox before a customer ever sees it.
  Only the actual order details stay under the system's control, so a template can never promise a
  total that is not what was charged.


- **See everything you have asked your suppliers for.** A Purchase orders page under Inventory shows
  every ask raised from a paid order: the supplier, what was asked for and what it costs you, which
  customer order it belongs to, where it has got to, and the tracking once they ship. Anything that
  could not be sent says why, in the list, without anybody going looking for it.

- **Start counting a product.** A product can now be put on the stock page from the console. Until
  now a newly added product could never be stocked at all without going through the API, which made
  the whole stock screen unreachable for anything new.

- **Record what actually happened to stock.** A product's panel now takes any of the five movements a
  person performs: stock arrived, a customer sent something back, the count was too low or too high,
  and damaged or lost. Only two of those could be recorded before, so a real count could not be
  corrected. Movements that belong to an order remain the order's to make.


- **Connect a supplier's own system, and check it before an order depends on it.** A supplier that
  takes orders through their own store can be connected from their record. The access token is
  stored encrypted and can never be read back, only replaced. A Check button asks the supplier's
  system to confirm every product mapped to them and **names the ones it does not recognise** — so a
  mistyped code is caught on a settings screen in seconds instead of by a customer waiting for
  something that was never ordered.

- **A supplier saying it shipped reaches your customer.** When a supplier fulfils an order in their
  own system, the tracking number and carrier land on the purchase order, become a real shipment on
  the order, and reach the customer through the same shipping email and portal as anything you ship
  yourself. Only that supplier can report it, proven by a signature, and reporting the same shipment
  twice never sends a second email or creates a second shipment. If a supplier reports shipping
  something you never asked for, or against an order that has been cancelled, that is recorded for
  you to look at rather than quietly accepted.

- **See what you have asked your suppliers for.** Purchase orders raised from paid orders are now
  readable, with their status and any tracking a supplier has sent back.

- **A supplier order survives a busy morning.** If the supplier's system is briefly rate limited,
  the order waits and tries again rather than being abandoned, and waits exactly as long as the
  supplier asks. If a supplier is not asked to fulfil automatically, QuickDash can ask them, without
  anybody opening another tab.

- **Groundwork for connecting a supplier's own system.** A supplier can now hold an encrypted
  connection to the service that fulfils its orders, kept separate from the supplier's own record
  and never readable back once saved. Nothing is switched on yet: this is the foundation the first
  automated handoff plugs into, and the shape every later one will reuse, so a business can
  eventually choose per supplier whether orders go out by email, by file, or straight into the
  supplier's own system.

- **A paid order is routed to whoever actually ships it.** Each supplier on an order is handed the
  order its own way, chosen per supplier rather than one setting for the whole business. Suppliers
  who take orders by email still get an email; a supplier connected to their own system has the
  order placed there directly. A supplier whose method has not been agreed yet leaves a purchase
  order waiting for a person, which is the honest state rather than a guess.

- **A supplier can never be sent the same order twice**, even when the same paid order is processed
  again after a network problem, and a handoff that failed is retried instead of being abandoned.
  Both were possible before: a retry either did nothing at all or risked a second real shipment.

- **Every list is a table you can read.** Columns have headings, they line up, and each list sits
  in its own bordered panel instead of floating as loose rows. Every list can be switched between
  a table and cards, and it remembers your choice for that page — products as cards, orders as a
  table, if that is how you like them.

- **Lists are paged, 25 at a time.** A business with fifty thousand records no longer tries to draw
  fifty thousand rows. Narrowing a search takes you back to the first page rather than stranding
  you on an empty one.

- **Rows and cards can be dragged into whatever order suits you.** That arrangement is yours alone
  and never changes the records, so nobody else's list moves because you rearranged yours.

- **A dot marks the exact record that needs you.** It comes from the same notifications as the
  bell, so reading a notification clears the mark on its row, and the two can never disagree.

- **Every record opens in a floating panel** — half the screen, laid over the list so you keep
  your place. Creating something new opens the same panel, so making a customer and editing one
  finally look alike.

- **A header across the top of every page**, carrying the page you are on, the record you have
  open, and that page's one action. Help is now summoned from the account menu and stays put for
  the session rather than sitting in the corner covering the page.

- **You can build a catalog.** Products can be created and edited in full: pricing, sale price,
  stock keeping unit, weight, web address, tags, photographs and which categories they belong to.
  Categories can be edited rather than deleted and remade.

- **Detail pages for everything else** — customers, invoices, quotes, payments, shipments, stock,
  bookings, projects, contracts and documents.

- **Stock warnings can be turned on.** An item's low stock level is editable for the first time,
  which is what the low stock notification watches.

- **Sell a subscription.** Offer a plan at a price on an interval, and a customer can sign up from
  your shop. Each renewal places an ordinary order, so stock, fulfilment and shipping work exactly
  as they do for a one off sale. A failed payment marks the subscription past due and tries again
  rather than cancelling somebody who would happily have updated their card.

- **Invoice an order.** Raising an invoice for a sale copies its lines, shipping and discount
  instead of making you retype them, so the invoice and the order can never disagree.

- **Sandbox and live are now two views of one workspace, and you can move between them freely.**
  Every order records which mode it was placed in, so a rehearsal and a real sale never mix: the
  console shows one at a time, and revenue counts only what is real. Switching used to be refused
  the moment a workspace held a single order, which made testing a one way door.

- **A shop can be closed for maintenance** without touching its payment settings. A closed shop
  refuses orders outright, and says so on the storefront rather than letting somebody choose
  coffee and enter a card before finding out.

- **Partner links.** Give a creator a code and hand out `yoursite.com/theircode`. Orders placed
  through it are credited to them at the rate you agreed, their audience can get a discount at the
  same time, and both the basket and a toast confirm it applied.

- **Suppliers.** Record who makes what you sell, how orders reach them, and the code each of your
  products carries in their system.

- **A page tells you what kind of problem it hit.** A failed list reports it where the list
  would be and keeps its search and filters, because they still describe what trying again would
  fetch. A page that cannot exist takes over the content area and withdraws those controls, since
  there is nothing left to search. A session that has ended takes the whole window, because
  nothing still on screen is current.

- **Hitting a plan limit now reads as an offer rather than a fault.** Inviting somebody past your
  seat count, or creating a workspace past your allowance, opens a quiet panel naming the limit
  with the plans beside it. It is never red, and "Not now" is a real answer that nothing follows
  up on.

- **A card at the foot of the sidebar shows the next thing worth doing** — the same next step the
  home page shows, or a usage allowance running low. One at a time, dismissible, and silent when
  there is nothing true to say.

- **Sandbox mode can be left from the banner that announces it**, instead of going to another
  application to find the switch.

- **Suppliers, and the codes they use for your products.** A business that does not make what it
  sells can now record who does: their contact, how orders are meant to reach them, their lead
  time, and the code each of your products has in their system. Sits under Inventory, because it
  is the answer to "where does my stock come from". A supplier whose handoff has not been agreed
  says so on the row rather than looking finished.

- **A page that has failed says which kind of failure it was.** A list that could not load reports
  it on one line and keeps its search and filters, because they still describe what trying again
  would fetch. A page that cannot exist at all — missing, not permitted, or a module that is
  switched off — replaces the whole screen instead, and takes the search box and the page's action
  button with it, so nothing is left offering to act on something that is not there.

### Fixed

- **The examples in every empty field are a business nobody recognises, on purpose.** Placeholders
  across the console were themed around one real customer's shop — its name, its address, its
  product codes, even its brand colour — which reads oddly to everybody else who uses QuickDash. They
  now all describe the same invented company, and none of them is anybody's actual business.


- **Your customers' card payments belong to you, and so does the risk.** Connecting a card processor
  now creates a full account in the business's own name, with its own dashboard, rather than a
  lightweight one managed through us. The practical difference is who covers a loss: with the
  lightweight kind, QuickEngine would have been liable for our customers' chargebacks and refunds,
  with money held in reserve against them. We take no share of your sales, so we should carry no
  share of that. This also removes a wall that stopped new businesses connecting a card processor at
  all.


- **Sandbox records stay in the sandbox.** Switching a workspace to live used to show it every test
  order ever placed in it, sitting in the same list as real ones with nothing to tell them apart.
  Four screens were affected and the worst of them was the first one you see each morning: Home's
  "needs your attention" listed sandbox orders to pack and sandbox payments to chase. Orders,
  payments and Home now show only the money you are actually dealing in. Notifications already
  worked this way.

- **A payment can no longer be refused as "not connected" when it plainly is.** Taking a payment
  picked whichever connected account came back first and then refused if it turned out to be the
  wrong one. A business with both Stripe and PayPal connected has two, and keeping both is something
  the product supports on purpose — so a perfectly good card could be refused on nothing more than
  row order. The payment is now matched to its own provider and mode, so the customer's money is
  taken rather than authorised and abandoned with nothing on screen to explain it.

- **Orders opens again.** The list gained a "how much has been refunded" figure and stopped loading
  at all, because of how the query was written rather than what it asked for. It loads, and the
  figure works.

- **A refunded order says so.** An order's status describes fulfilment, so an order refunded in full
  still read "placed" — and in a list of work to do that means somebody picks and packs a parcel for
  a customer who already has their money back. Fully and partly refunded orders are now marked as
  what they are.

- **Opening a record clears its notification.** The dot beside an order stayed lit after the order
  had been read, because the screen had no way to tell which notification belonged to what it was
  showing.

- **Product photographs appear on your own site.** Images served to a storefront were being blocked
  by the browser before they were drawn — no error, no broken-image icon, just an absence.

- **A sign-in link comes from the shop it signs you into.** The email was branded as the business but
  arrived from QuickEngine, which is the shape of a phishing message and the fastest route to being
  marked spam.

- **A test order is not a failed order.** A sandbox sale is deliberately held back from reaching a
  real supplier, and that refusal was recorded as a failure — putting a red "could not be sent"
  beside every test, next to real ones that genuinely need somebody to act.

- **Add a record from where you are looking at them.** The button to create one sat in a bar at the
  top of the window, away from the search and view controls it belongs beside. That bar is gone; the
  space belongs to your records.

- **One business's records can never reach another's.** Everything that runs on your behalf in the
  background — the emails your customers receive, stock going back after a refund, a partner's
  commission — now names the business it is acting for before it reads anything, rather than
  trusting the record it was handed. Search works the same way: a business's own results are the
  only ones it can be shown, and that is now impossible to write incorrectly rather than merely
  checked. None of this was ever reachable from outside, and it is closed anyway, because "nobody
  could have done it" is not the same as "nobody can".

- **Two customers can never buy the last one.** Proven rather than assumed: ten people buying the same
  single item at the same instant now leaves exactly one sale and one item held, and five people
  buying from a shelf of ten all succeed. Counting stock by hand is protected the same way, so twenty
  simultaneous corrections all land and nothing can drive a count below zero.

- **A refund puts the stock back.** Refunding a customer reversed the money and left the count
  alone, so a returned item stayed sold as far as stock was concerned and a business slowly
  undercounted what it could sell. Nothing looked wrong while it happened, because the number stays
  entirely plausible. A full refund now returns the goods to the shelf, and there is a **Restock**
  choice beside the amount for the times they are not coming back: damaged in transit, lost by the
  carrier, or a goodwill refund where the customer keeps what they bought. It is only offered on a
  full refund, because a partial refund is an amount rather than a list of items and names nothing
  that could be put back.

- **Signing up for a recurring plan actually creates one.** Paying for a subscription recorded the
  order, sent the receipt, and then quietly failed to write the subscription itself, so the customer
  was never charged again and nobody was ever reminded. Nothing on any screen said so. The plan is
  now recorded against the same customer the order belongs to, and if it ever cannot be, whoever
  runs the business is told rather than a line being written to a log nobody reads.

- **Partners are paid the commission they earned.** A referral was recorded when an order was
  created and then nothing ever completed it, so no partner or creator had ever actually been
  credited for a sale. Commissions are now settled when the customer's payment succeeds, and
  reversed if that order is later refunded or cancelled. A referral attached to an order the
  customer abandoned at payment moves to the order they eventually paid for, instead of being
  stranded on one that never settled. Two parts of the system also disagreed about rounding a
  commission to the cent; both now round the same way, in the customer's favour.

- **A test order can never be counted as real money.** Sandbox and live records share the same
  tables, and eleven places read them without asking which was which. The worst was total revenue,
  where paying with a test card added to what the business had actually earned. Reports, the payment
  list and review verification were affected too. A check now runs on every build and fails if a new
  query forgets, so this cannot come back quietly.

- **Sandbox news and real news are no longer the same news.** Notifications carried no workspace and
  no mode, so a test order's "New order" was indistinguishable from a real customer paying. Each
  workspace now shows only its own, in its own mode. Account-level notices — an invitation, a
  billing notice — have no mode and still appear everywhere, which is where they belong.

- **A test order can no longer reach a real supplier.** A sandbox checkout placed a genuine order in
  a supplier's own system, and a supplier would have picked, packed and shipped real goods for a
  sale that never happened. Sandbox orders now stop at the handoff, and the purchase order is still
  raised so it is visible rather than silently dropped.

- **A supplier order keeps the customer's address.** Orders placed into a supplier's system were
  losing the delivery address entirely, which would have left a supplier holding a paid order with
  nowhere to send it.

- **Archived suppliers stay out of the purchase order list.** The filter meant to exclude them was
  written so that it could never exclude anything.

- **Checking a supplier connection works the first time.** Saving a connection and immediately
  checking it reported that no connection existed, because the check refused to look at one that had
  not been checked yet — which it could not have been.


- **A subscription plan can no longer be created with no price.** Typing something that is not a
  number left the plan at zero and charged every customer on it nothing, forever, with nothing on
  screen to show it. The price must now be a real amount before the plan can be offered.


- **Security updates for bundled libraries can arrive on their own.** Pinned replacements for
  vulnerable libraries were locked to one exact version, which meant the next fix for the same
  library could not be picked up without somebody editing a file by hand. They now accept later
  patches automatically, and one pin that was holding a library on a version with a known issue has
  been removed entirely because it was no longer needed.


- **Setting up an authenticator no longer fails silently.** Turning on two-factor authentication
  reads the authenticator secret only when there is one to read, so a setup that returns a different
  kind of code says so plainly instead of showing an empty screen. This applies on both screens that
  offer it, in sign-in and in account settings.

- **Names and web addresses with unusual punctuation are handled in one pass.** Workspace names,
  organisation names, portal addresses and API key origins are trimmed by counting characters rather
  than by pattern matching, so a value made of hundreds of repeated hyphens or slashes cannot make
  the server work harder than it should.


- **A brand new workspace opens.** A workspace created with the Content module switched on showed a
  blank name over an empty sidebar, as though it had been deleted, and nothing in it could be
  reached. The workspace was always fine: its setup checklist covered a step the dashboard had no
  way to check off, and rather than leaving that one item unticked it gave up on the whole screen.
  An unrecognised checklist step is now simply not done yet, so a checklist can never take a
  workspace down with it.

- **An order can be fulfilled from the dashboard.** A paid order can now be confirmed and shipped:
  the delivery address and the items are carried over from the order, so the only thing to enter is
  the parcel weight. Sending part of an order leaves the rest outstanding, and once everything has
  gone the order says so instead of offering to send it again.

- **An order's status follows its parcels.** Creating a shipment moves the order into processing,
  and the order completes on its own once nothing is left to send. It was possible to mark an order
  fulfilled with no shipment at all.

- **Tracking can be added after a parcel is packed.** A carrier and tracking number could only be
  entered at the moment a shipment was created, which is rarely when you have them, and a wrong one
  could never be corrected.

- **The delivery address appears on an order.** The "Deliver to" panel never showed anything, on the
  one screen whose job is telling you where to send the parcel.

- **A customer is told their order shipped when it ships.** The notice was sent while the parcel was
  still being packed, so a shipment that was then cancelled had already been announced.

- **Notifications that need you reach you by email.** Anything asking for attention, such as low
  stock or a shipment problem, now also arrives in your inbox. Routine progress stays in the app so
  the important ones are not buried.

- **You are told when an order ships and when it arrives.** Shipments only appeared in your
  notifications when something went wrong with them.

- **A product's weight accepts "340g".** Typing the unit the field asks for silently discarded the
  weight.

### Added

- **Orders are handed to your suppliers automatically.** When an order is paid, whatever you do not
  make yourself becomes a purchase order for the supplier who does, using their own product code and
  the customer's address, ready to send. Items you stock yourself are left alone, an order split
  across two suppliers becomes two purchase orders, and the same order can never be sent to a
  supplier twice.

- **Supplier orders are sent from your own address, or not at all.** Until your sending domain is
  verified, a purchase order is held for you to send by hand rather than going out under
  QuickDash's name.

- **You can see the API key you just created.** Keys were issued correctly, stored correctly and
  worked — and were never shown, so every key was lost the moment it was made and the only way
  forward was to create another and lose that one too. The key now appears once, with a copy
  button and a warning that it will not be shown again.

- **Amounts accept the way people actually write them.** Typing `$12.00` into a shipping rate,
  `$5.00` into a refund or `15%` into a discount left the save button dead with nothing on screen
  explaining why. Currency symbols, percent signs and stray spaces are now understood everywhere
  an amount is entered.

- **Adding stock no longer opens the wrong thing.** Clicking the quantity box on a stock row
  opened the record instead, and the panel then covered the box you were aiming at. The quantity
  box and its two buttons now behave like the controls they are, and match the rest of the row.

- **A delivery address is chosen from a list.** Typing a province by name was rejected by the
  shipping quote with an error that named neither the field nor the reason, which made checkout
  impossible to finish. Provinces are now picked from a list.

- **Your discount follows you to checkout.** The basket showed the reduced total and checkout
  showed the full one, while the amount actually charged was the reduced figure — three different
  numbers for one order. Checkout now shows the same saving the basket does, priced by the server
  in both places.

- **A basket no longer counts things that are not in it.** Products removed from a shop stayed in
  the basket count while the basket itself showed empty.

- **The workspace switcher no longer asks for keys that belong to nothing.** A failed request went
  out on every page load before a workspace had been chosen.

- **You can create an API key again.** Choosing Publishable, Storefront or Secret produced "an API
  key needs at least one capability" and refused, so connecting a storefront could not be
  completed at all. Each kind now carries what it is allowed to do.

- **One workspace's notifications no longer appear in another.** The inbox is per person, so
  every workspace was showing every other workspace's notices — and worse, marking sidebar rows
  in a business where nothing had happened. Following one of those marks led to an empty page.

- **Switches say which way they are set.** Module switches turn green when the module is on, with
  a white knob that can actually be seen against it. Switches that choose between two equal things
  — table or cards, sandbox or live — keep a neutral colour and gain a visible edge, because
  neither side of those is "on".

- **Leaving sandbox mode works from QuickDash.** The request was missing the organization it
  belonged to, so it never arrived, and the failure was then reported as "this workspace already
  has orders" — a sentence about a different problem entirely, on a workspace that was empty.

- **A refused mode change explains itself.** It said the workspace had "entered the payment
  lifecycle", which is a phrase from inside our own codebase, and it arrived indistinguishable
  from an ordinary invalid request.

- **A malformed request says so.** Every other kind of failure had its own explanation and this
  one fell through to "something went wrong".

- **A panel whose contents fail to load says so**, instead of showing "Loading…" for ever — which
  looked exactly like a slow connection and so was never reported.

- **A reply that fails to send says so**, and keeps what you wrote. The box cleared either way, so
  a refused reply looked identical to a sent one and a waiting customer was never answered.

- **Products behaves like every other list** — the same search and filter controls, and paged
  twenty five at a time rather than drawing a whole catalog of images at once.

- **The suppliers page loads.** Its address was being read as the identifier of a single stock
  record, so the page failed before it started. The same fault had already shipped once before,
  on a payments address, and there is now a test that walks the whole address table and fails if
  any fixed address is hidden behind a variable one.

- **A broken page no longer wears the sign-in screen's clothes.** A fault inside the console was
  rendered with the sign-in wordmark and a spaced-out "ERROR" heading, which belonged to a
  different part of the product entirely.

- **The console stopped asking the same question four times a minute.** A check for whether
  anything had ever called the workspace repeated every fifteen seconds on every page, forever, to
  answer something already known.

- **The marks in the sidebar line up.** Notification dots and the arrows beside expandable
  sections sat two and a half pixels apart, because one is six pixels wide and the other eleven.

- **Uploading a product photograph works.** It had three separate faults, any one of which looked
  identical from the outside: the request was refused for want of an idempotency key, the
  development file store accepted images and threw them away, and a one megabyte request limit
  rejected every real photograph before it arrived.

- **Browsing the console no longer signs you out.** Checking who you are on every page change
  exceeded the sign-in service's own rate limit, and the resulting refusal was read as "you are
  not signed in" rather than "ask again in a moment".

- **A page that breaks no longer claims you are offline.** Any ordinary fault was being reported
  as a connection problem, which sent people to check their internet while the real error stayed
  hidden.

- **Marking a fulfillment or a shipment no longer fails silently**, for the same missing-key
  reason as photographs.


- **QuickDash tells you when something happens.** A paid order, a customer waiting on a reply, a
  disputed payment, a shipment somebody flagged, and stock running low all now reach the person
  running the business. They arrive in the bell and stay there until read, and if you are looking at
  the dashboard when one lands it also appears briefly in the bottom corner, where it can be
  clicked, dismissed or dragged away. Deliberately a short list: a notification for everything is a
  notification nobody reads.

- **The sidebar shows you where the problem is.** A disputed payment puts a red dot on Payments, a
  new order a blue one on Orders, a flagged shipment an amber one on Shipping. A closed group shows
  the most urgent thing hiding inside it, so nothing waits unseen behind a collapsed heading.

- **A disputed payment now reaches QuickDash at all.** Previously a customer disputing a charge
  changed nothing anywhere: the payment still read as succeeded and nobody was told. Disputes are
  recorded against the payment and raised immediately, because they carry a deadline and an
  unanswered one loses the money by default.

- **Notifications say how urgent they are, by colour.** Blue for something new, amber for something
  that needs a decision, red for something that failed. The same three colours mean the same three
  things in QuickDash and in your account, because it is one inbox.

- **Being told twice is no longer possible.** However many times the system retries delivering an
  event, each person is told once. Low stock is reported once a day per product rather than on
  every sale of it.

- **A business can collect payments through its own PayPal.** Connect it from Payments, and
  checkout, captures and refunds all run through that business's own PayPal account. The money is
  theirs and goes straight to them; QuickEngine never stands in the middle and takes nothing from
  what they earn. The details they supply are checked with PayPal before they are saved, stored
  encrypted, and never shown again by anyone.

- **Where you get paid is now a page.** Payments shows every supported provider, whether each one
  can actually take money rather than merely being connected, and which one checkout will use.

- **Connect says whether your site has ever reached this workspace, and remembers it.** It also
  lists the addresses each key allows, which is the first thing worth checking when a site is being
  refused. Refreshing the page no longer loses the answer, because it is read from what actually
  happened rather than noticed only while the page was open.

- **Products have a page again.** QuickDash lists what a business sells, with search, a status
  filter and a choice of cards or a table. Opening a product shows its photographs, where they can
  be added by dragging them in or picking files, removed, and put in order. The first photograph is
  the one a shop shows, and the page says so.

- **Product photographs can be uploaded.** A business can add images to a catalog item, reorder
  them and remove them, and the pictures are served from a permanent web address so a storefront
  can show them. Images are kept apart from private documents like signed contracts, which are
  still only ever shared through a link that expires.

### Fixed

- **A single missing field no longer empties the account overview.** One chart expecting data an
  older server had not started sending took the whole page down with it, which could leave
  somebody unable to get into their account. A part of the page that cannot load now fails on its
  own.

- **A business moving from the old QuickDash keeps its work.** An import brings a workspace's
  products, categories, website copy, FAQ, testimonials and discount codes across in one run.
  Prices come over at what a shopper actually pays, so an item on sale stays on sale, and the
  import can be run again safely if it is interrupted. The first real migration moved a live
  store's 31 products and 117 pieces of site copy.

- **Somewhere to put a picture.** Storage now separates files a business keeps private, like a
  signed contract, from images it publishes on its own website. Public images get a permanent
  web address instead of a link that expires, which is what a product photograph has needed all
  along.

- **Orders now carry the complete operating picture.** Opening an order in QuickDash shows its
  immutable purchased items and totals, delivery destination, payment and refund state, and
  shipment progress. Creating a shipment prefills the order's snapshotted destination instead
  of asking an operator to retype a customer's address.

- **A business can connect Stripe where it manages payments.** The Payments module now shows
  whether Stripe is disconnected, incomplete or ready, keeps sandbox mode visible, sends the
  owner through Stripe's hosted setup and checks the account again when they return.

- **Custom storefronts can finish connected-account payments securely.** Checkout now returns
  the browser-safe provider account identifier alongside its provider-neutral next action, so
  Stripe.js can confirm a direct charge without exposing a server credential or guessing which
  merchant owns the payment.

- **Test payments can no longer contaminate a live business.** A workspace now declares whether
  it is for sandbox testing or live operation. Provider accounts, payment records, refunds and
  signed webhook endpoints carry the same boundary, QuickDash keeps test mode visible, and the
  system requires a separate live workspace once testing reaches an order or payment.

- **The front of the product now looks like the product.** The backend and the security work
  were done; the interface in front of them was not. This is the first full design pass: a new
  marketing front page built around a live gradient, a pricing page driven by the real plan
  ladder instead of placeholder tiers, and every sign-in, sign-up, verification, recovery and
  two-factor screen rebuilt. One typeface, one set of buttons and one header across all of it,
  so moving between the marketing site and signing in no longer feels like changing companies.

- **Error pages that belong to the site.** A missing page, a failure on our side and planned
  maintenance each have a real screen now, with the same header, footer, gradient and buttons as
  everything else, instead of a bare status number on a black background. None of them show you
  a status code or an internal error message, because neither tells you anything you can act on.

- **The site tells you when your connection drops.** A banner across the top when you go
  offline, a confirmation when you come back, and a way to dismiss either. It uses the same two
  colours as the buttons rather than an alert red, because losing signal is not an error and
  nothing is broken.

- **A slow page now looks like it is loading.** Pages that take a moment to arrive show their
  shape while they do. It is deliberately hard to trigger: pages are fetched as soon as you hover
  a link, and the placeholder is held back until a page has genuinely stalled, so an ordinary
  click never flashes one.

- **Passwords now have real rules, and you can see them as you type.** Setting a password shows
  a strength bar and a live checklist: ten characters, an uppercase and a lowercase letter, a
  number and a symbol. Signing up still needs no password at all — a code, Google, GitHub or a
  passkey — and a password stays something you add later if you want one.

- **Email addresses are checked before we try to send anything.** Typing an address that cannot
  work now says so straight away, in the same place every other message on the page appears,
  rather than through the browser's own popup.

- **The pricing page now shows the intended launch model without pretending billing is open.**
  Free, Launch, Grow, Scale, Expand and Custom have one coherent allowance table, and the public
  repository labels it pre-release while entitlement and live Stripe verification remain launch
  work rather than hidden assumptions.

### Fixed

- **Unpaid checkouts no longer tell customers that an order is confirmed.** Order email and
  customer-account confirmation now wait for the provider-verified `order.paid` event, while
  paid guest orders still receive the business's branded confirmation.

- **A paid storefront order now commits as one complete business event.** Provider settlement
  now records the successful payment, places the order through its real lifecycle, reserves its
  stock, writes audit evidence and publishes a dedicated paid-order event in one transaction.
  Stripe webhooks and captured PayPal checkouts use the same path, so an external fulfiller can
  never receive an order that only looked paid while its inventory or ledger disagreed.

- **Refund notifications now reach the payment they belong to.** A refund arrives from Stripe
  describing the charge, while a payment is tracked by the payment attempt it came from, so every
  refund notification was discarded before anything could act on it. Refunds made in Stripe were
  accepted and then lost. They now find their payment and are recorded against it.

- **A refund can no longer go out on a request that is then rejected.** The refund endpoint called
  the payment provider before checking the request was valid, so a call missing its idempotency key
  sent the money back and then answered with an error. The business was told nothing happened while
  the customer had already been refunded, and no record of it existed. Every check now runs before
  any money moves.

- **A refund made in Stripe now appears in QuickDash.** Refund notifications from the provider were
  accepted and then ignored, so a refund issued outside QuickDash left no trace here. This is the
  route the Payments module itself recommends, and it now records the refund against the payment
  and reconciles any invoice it belonged to. The order is deliberately left alone, because a refund
  is not a cancellation and what happens to the order is the operator's decision.

- **A paid order now shows its payment as paid, and can be refunded.** Settlement placed the order
  but left the payment itself in pending forever, so money that had already cleared still looked
  outstanding and no completed sale could be refunded, because refunding requires a settled
  payment. The payment is now settled from the same signed webhook and separately from the order,
  so it is never stranded by an order that had already moved on.

- **Stripe accounts can now actually take a card.** Connecting Stripe asks for the card payment
  capability when the account is created, which it previously never did. Without it Stripe
  accepted the setup, reported the account as working and then refused every payment, so the
  failure only appeared once a real customer tried to buy something.

- **Payments no longer reports a business as ready when it cannot be paid.** Readiness now
  checks whether Stripe has actually granted the card payment capability, rather than trusting a
  general status flag that can be true while every charge is rejected. A business that cannot
  sell yet is shown as still in setup, and its storefront says so at checkout instead of failing
  after the shopper has entered their card.

- **A business stuck part way through Stripe setup can now recover on its own.** Resuming setup
  re-requests the missing capability on the existing account, so an account created before this
  fix repairs itself the next time the owner continues setup, without a support request and
  without a second merchant account.

- **Opening payment setup no longer treats “connect” as a payment ID.** The static provider
  setup routes now take precedence over individual payment records, so a workspace that has not
  connected Stripe sees the setup action instead of an invalid-request error.

- **Webhook encryption checks no longer pass by chance.** The tamper test now always changes
  the encrypted payload, so CI consistently proves that modified signing secrets are rejected.

- **Restarting payment setup no longer creates another merchant account.** An expired or
  abandoned Stripe or PayPal onboarding session now resumes the pending provider account instead
  of leaving duplicates behind every time the owner tries again.

- **Provider events cannot cross from sandbox to live.** Stripe and PayPal now use separate
  credentials and webhook signatures for each mode, and settlement resolves the provider,
  environment and connected account together. Identical test and live provider IDs remain
  isolated rather than colliding or updating the wrong order.

- **Customer portals can be published again.** Portal setup now issues a usable,
  browser-safe catalog key instead of requesting an empty credential that every API
  endpoint correctly refuses.

- **An error under a form no longer moves the button you were reaching for.** Messages appear in
  space that is already reserved for them, so nothing on the screen shifts when one arrives or
  clears. It mattered most when entering a code, where you get three attempts and the button used
  to jump down at the exact moment you went to press it again.

- **Reopening a tab after an update no longer looks like a crash.** If we shipped a new version
  while you had the site open, moving to a page you had not visited failed and reported an error
  on our side. It now recognises what happened, picks up the new version by itself, and if that
  does not work says plainly that there is a newer version rather than blaming something else.

- **The logo and buttons line up between the marketing site and signing in.** The two headers
  were set to different heights and the mark to different sizes, which nothing revealed on one
  page and which was obvious the moment you moved between them. The footer mark matches now too.

- **Quick.js is verified as the package customers actually install.** CI now builds and packs
  the public SDK, rejects source and source-map leaks, installs the tarball into an empty project
  and proves its ESM, CommonJS and browser entry points. Compatibility, deprecation, release and
  private security-reporting expectations are documented.

- **Recovery artifacts are protected like customer data.** A single-workspace recovery now
  refuses to write inside the repository, creates a private owner-only file and will not
  overwrite an existing extract. Provider failures no longer copy response bodies into terminal
  errors, and the safety contract runs automatically with the repository checks.

- **Incidents have an operating procedure.** The internal response plan now defines severity,
  ownership, evidence preservation, containment, provider and credential compromise, tenant
  disclosure, data recovery, customer communication and post-incident review for the two-founder
  team.

- **Every API route is attacked for tenant confusion in CI.** The security suite now walks the
  real registered route table with valid credentials deliberately combined in invalid ways: a
  customer session from another business, a server credential in a storefront channel, and an
  API key paired with another workspace. Any route that serves a successful response across one
  of those boundaries fails the build automatically, including routes added in the future.

- **Every web surface now ships a browser security boundary.** QuickEngine, Auth, Account,
  QuickDash and the customer portal send an enforced content policy, anti-framing protection,
  HTTPS persistence, conservative browser permissions and resource-isolation headers. The API
  applies the same principles to every response, and CI refuses a new surface that omits them.

- **Webhooks can only call the public internet.** A webhook address is checked when it is
  registered and resolved again immediately before every delivery. Local, private, reserved,
  metadata and mixed public/private DNS destinations are refused; the connection is pinned to
  the address that passed the check; and redirects cannot move a request somewhere unverified.

- **Security analysis now runs continuously.** CodeQL runs for every pull request and main
  update plus a weekly schedule, and every third-party GitHub Action is pinned to the exact
  reviewed revision instead of a mutable tag.

- **Edit your website's words in QuickDash.** The Content module had no screen at all, so the
  one thing a portfolio, agency or brochure site needs most could only be reached through the
  API. It now has one: every slot your developer declared, grouped as they grouped it, with the
  label and hint they wrote, a publish switch per slot, and unsaved changes shown before you
  leave. Slots holding a repeating list are edited as structured text for now.

- **The connection kit is on npm.** `@quickengine/quick` installs the ordinary way with pnpm,
  npm, yarn or bun, so connecting a website no longer means copying files around or pointing at
  a folder on one machine. Until now the setup instructions named an install command that did
  not work, and no connected site could be deployed anywhere.

- **Setup instructions for a site that does not sell.** The connection guide covered shops and
  assumed a catalog and a checkout. It now also covers a portfolio, an agency site, or any site
  that only publishes words: reading your workspace's content, keeping the page correct while it
  is not yet connected, and receiving an enquiry from a contact form.

- **The content security policy step is written down.** A site that restricts where its browser
  may connect has to name the QuickDash API, and leaving it out produced a failure that reads
  exactly like the service being unavailable. It is now the first thing the guide says.

### Fixed

- **PayPal checkout now sends shoppers to the approval screen it promised.** QuickDash kept
  PayPal's order identifier but discarded the provider's approval link, while Quick.js told
  every storefront it would receive a URL. The provider now preserves the exact reviewed link
  returned by PayPal and refuses an incomplete response instead of handing a broken next action
  to the storefront.

- **A mistyped catalog price no longer takes down the entire QuickDash page.** Product and
  variant form parsing now runs inside the recoverable action boundary, so invalid values stay
  in the dialog with an actionable error. Ordinary currency input such as `$24.00` and
  `1,024.50` is accepted and still becomes exact integer cents.

- **New connected projects target the live product and run their first write.** The CLI and its
  generated configuration no longer point at retired QuickEngine API hosts, and the generated
  idempotent client write now uses the SDK's real argument shape instead of throwing at runtime.

- **Known vulnerable web dependencies are patched.** Hono, its Node server, PostCSS, Nano ID,
  JS-YAML and both supported Undici lines now resolve outside their reported advisory ranges.
  The production dependency audit is clean.

- **Local pnpm cache metadata stays local.** A repository-local `.pnpm-store` can no longer be
  swept into a commit by `git add -A`.

- **A key for your own server now actually works.** Choosing "a private server" on Connect
  produced a key that signed in and was then refused by everything, including simply reading
  data — and since Connect is the only place keys are made, there was no way to create a working
  one at all. It now receives the access its type allows, and a key that could do nothing is
  refused outright rather than handed over looking fine.

- **You can fix a key instead of replacing it.** What a key is allowed to do can now be changed
  after it is created, so a wrong choice no longer means issuing a new one and updating every
  place the old one was pasted. Changes are still capped by what that kind of key may ever hold.

- **Errors say what went wrong again.** Anything the API refused came back to connected sites as
  a generic failure with the real reason stripped out, so code written to react to a specific
  problem never matched and every fault looked identical while debugging.

### Changed

- **Secrets stay out of storage, logs and diagnostics.** New OAuth provider tokens are encrypted
  before they reach the database, while existing accounts remain usable and are upgraded when a
  provider refreshes them. API logs and error monitoring keep safe error names and codes without
  copying database values, provider messages, tokens or customer details. File responses no
  longer reveal which internal storage provider holds an upload, and oversized requests are
  stopped while they are being read rather than after they have consumed memory. Automated tests
  cannot send through a live email provider even when a developer's local key is present.

- **Revoking a session takes effect immediately.** Authentication no longer trusts a cached
  session for several minutes after the server has revoked it. Session cookies remain HTTP-only,
  same-site and secure in production, but every authenticated request now verifies that the
  session still exists.

- **Private API responses cannot enter browser or CDN caches.** The API marks every response
  `no-store`; public catalog caching can return later with explicit workspace-aware cache keys
  instead of risking one business receiving another business's response.

- **The connection kit is a tenth of the size.** Old build output was never cleared, so each
  release carried every previous version of itself — 3.4 MB where 368 KB was needed.

- **Connect your website to your backend in about two minutes.** A workspace now has a Connect
  page that asks what you are connecting, takes your site's address, and gives you the exact
  configuration to paste in. It then watches for your site's first request and tells you the
  moment it arrives, so you find out you are connected instead of hoping.

- **Lock a key to your own website.** A key can now name the addresses it may be used from, and
  a browser loading your site from anywhere else is refused. This was enforced already but could
  not be set anywhere, so browser keys had to be configured by hand in the database. You can
  change the addresses later from either Connect or Account, and the change takes effect within
  seconds.

- **See at a glance which sites a key allows.** Every key in Account now lists its addresses, and
  a browser key with none is flagged clearly rather than looking healthy and failing everywhere.

- **Go from a shop to your account without signing in twice.** A customer who is already signed
  in on a business's own website can open their account portal directly. The website never hands
  the portal its session; it requests a single-use pass that expires in about a minute and can be
  redeemed once, and the portal opens a separate session of its own. Signing out of one leaves
  the other alone, and a pass issued by one business cannot open an account at another.

- **Prove a whole sale end to end on a connected website.** A guarded local run now covers
  discount codes priced against the real basket, delivery options, an order with authoritative
  totals that a repeated request cannot duplicate, a customer seeing only their own orders, a
  two-way message answered by the business and read back by the customer, and the portal pass.

### Changed

- **Discount codes are worked out by QuickDash, never by the website.** A connected site now
  sends the basket and receives the amount off, instead of sending its own order total. Minimum
  spend, caps and expiry are checked against the items the server priced, so what a shopper is
  shown and what they are charged cannot disagree.

- **An order now exists before the customer is sent to pay.** Checkout records the sale, its
  delivery choice and its discount in one step and then opens the payment against it. Returning
  from the payment provider only confirms what is already there, so a completed payment can no
  longer end up with no order behind it, and refreshing the confirmation page cannot pay twice.

- **A referral rewards the person who made it, and no longer pretends to be a discount.** A
  referral code is recorded with the order it brought in and pays out when that order settles.
  It is a separate field from a discount code, so clearing the discount box cannot silently cost
  a referrer their credit.

### Removed

- **Order tracking by order number and email.** Those two values can be guessed or read off a
  forwarded receipt, and order numbers run in sequence, so the form could be walked to read other
  people's delivery addresses. Customers see their orders by signing in with the link emailed to
  them, which proves the address instead of quoting it.

- **Keep a customer's storefront account private and portable.** A custom site can now send a
  passwordless sign-in link back to its own registered origin, restore that customer's session,
  merge a guest wishlist into the account, show published reviews, submit moderated reviews and
  issue referral codes. Callback origins are checked against the exact browser key, customer
  sessions remain workspace-isolated, and sign-out revokes the token.

- **Prove a connected storefront with realistic navigation and copy.** The guarded Gemsutopia
  fixture now includes categories, item memberships and published content alongside its catalog
  and inventory, so a custom frontend can exercise complete browsing behavior against Docker
  without touching a live workspace.

- **Show real stock on any connected website.** QuickConnect can now read authoritative
  availability for catalog items and variants, including reservations, untracked products and
  businesses that deliberately allow backorders. Browser storefront keys are also forced to see
  active products only, so a draft or archived listing cannot leak onto a public site.

- **Connect any custom website or app to QuickDash.** QuickConnect provides one browser-safe,
  framework-independent client for catalog browsing, discounts, delivery quotes, checkout,
  customer sign-in, orders, shipment tracking, wishlists, reviews, referrals and private
  messages. A customer can see a complete order without seeing another customer's payment or
  shipment state, and the frontend remains free to use any framework, design or hosting.

- **Keep Stripe and PayPal connected at the same time.** A workspace can now retain one
  merchant account per payment provider, choose which one new checkouts use by default, and
  still send settlement and refunds through the provider that handled the original payment.
  Existing Stripe connections remain the default during the migration.

- **Connect PayPal and complete a sale through the same checkout as Stripe.** A business can
  select PayPal during payment onboarding, send its seller through PayPal's hosted approval,
  return an approved order for server-side capture, receive verified settlement webhooks, and
  issue refunds through the provider. Storefront credentials never receive QuickEngine's
  PayPal secrets, and the stored workspace payment—not the browser—chooses which merchant gets
  paid.

- **PayPal's complete platform handshake is covered before it touches a checkout.** The
  payments layer can now create seller referrals, inspect merchant readiness, create and
  capture seller-owned orders, refund captures, and ask PayPal to verify signed webhook
  deliveries. Contract tests pin the exact seller identity, integer-cent amounts, permissions,
  and transmission data that must cross the provider boundary.

- **One checkout contract for every payment provider.** Storefront checkout now says exactly
  what the buyer must do next — confirm a client secret, approve a provider order, follow a
  hosted redirect, or nothing — instead of assuming every payment provider behaves like
  Stripe. This is the stable browser contract PayPal and future providers plug into.

- **Talk to customers without losing the conversation.** Customers now have a private inbox in
  the business's portal, where they can ask questions, read replies, and see order, payment,
  shipment, booking, and invoice updates. Businesses can start, reply to, read, close, and
  reopen those conversations from the workspace API, with every thread isolated to the right
  workspace and customer.

- **Charge the delivery price you intended.** Set shipping zones by country or region, add flat,
  weight-based, order-value and free-shipping rates, and show eligible choices at checkout.
  QuickDash prices the basket and its weight itself, rechecks the chosen rate before charging,
  includes delivery in tax and the order total, and keeps the agreed rate and address on the
  order even if your settings change later.

- **Put your customer portal on your own domain.** Instead of sending your customers to a
  QuickDash address, point your own — `account.yourshop.com` — at your portal, and that is the
  only name they ever see. Add it in one place, point a CNAME at us, and it works. Remove it
  and your portal goes back to its original address; nothing your customers saved is affected
  either way. A domain can only belong to one workspace, so nobody can take yours.

- **Reviews, and you decide which ones go live.** Customers can rate and review what they
  bought. Nothing appears on your site until you approve it, and you can reject one with a
  private note explaining why. Reviews from someone who actually ordered the item are marked as
  verified. Reviewers are shown as a first name and last initial, never an email address.

- **Referrals.** Your customers get a code to share, and earn a reward when someone new orders
  with it. Nobody can refer themselves, and a customer can only be referred once — the reward
  is for bringing someone, and someone is only brought once. Rewards are credited when the
  order is actually paid, not when it is placed, and are reversed if it is cancelled.

- **Discount codes.** Create a code that takes off a percentage or a fixed amount, with an
  optional minimum spend, a limit on how many times it can be used in total or by one customer,
  and a date window. Your website can check a code before checkout and show the customer what
  it saves them. Tax is worked out after the discount, so nobody is charged tax on money they
  did not pay.

- **Your customers can save things for later.** A shopper signed in to your portal can keep a
  wishlist, including which option they wanted. Anything they saved before signing in comes
  with them, added to what they already had rather than replacing it. An item you withdraw
  stays on their list marked as unavailable, so nothing disappears without explanation.

- **Group your catalog into categories and collections.** Arrange what you sell into a
  browsable structure — nested if you want one — and put the same item in more than one place.
  A collection can be hidden while you prepare it and brought back later without losing what
  you put in it.

- **Edit the words on your own website.** A new Content module lets you change your About
  section, a headline, or your legal pages without touching code or asking a developer. Your
  site declares which parts are editable; you fill them in. Nothing you write appears until you
  publish it, so a half-finished sentence never reaches a visitor.
- **Payments can be attached to an order.** A shop running its own payment provider can now
  record the payment against the order it belongs to, so the money and the goods are linked
  rather than sitting in two unconnected records.

- **Your website can now take orders and payments.** A shopper on your own site can check out
  without leaving it. You send what they picked; we price it from your catalog, add your tax
  rate, record the order and take the payment into your account. Nothing about the amount comes
  from the browser.
- **Money reaches you, not us.** Card payments are made to your own connected account, so your
  business name is what appears on your customer's statement.
- **Refunds actually refund.** Issuing a refund now returns the money through the payment
  provider. Previously it only recorded that one had happened.

- **A key your own website can sell with.** Storefront keys sit alongside publishable ones:
  browser-safe, and allowed to take an order. Your site sends what the shopper picked and how
  many; we price it from your catalog. A key that cannot name an amount cannot be used to buy
  anything cheaply.

- **Your customers can now sign in and see their own records.** Somebody who buys from you,
  books with you, or is invoiced by you can sign in with their email — no password — and see
  their orders, bookings and invoices. Nothing else. Until now there was no way for the people
  your business serves to see anything at all.
- **They keep what they bought before they had an account.** Somebody who checked out as a guest
  and later signs in with the same address finds their earlier purchases already there. Nothing
  to import, no reference number to quote.
- **Signing in as a customer does not create a QuickEngine account.** Your customers are yours.
  They cost you no seats, never appear in your team, and cannot reach your dashboard. A person
  can be a customer of several businesses and see only what belongs to them at each one.
- **A customer portal, hosted for you.** Every workspace gets one. It shows your business's name
  and only the sections you actually run — a shop shows Orders, a clinic shows Bookings, an
  agency shows Invoices. Nothing to deploy or maintain.
- **Receipts and confirmations are sent.** An order, a payment, a shipment and a booking each
  send an email now. Previously a customer paid and heard nothing, which reads as a failure even
  when the payment worked. Guest purchases are included.
- **The emails come from your business, not from us.** Your name, your support address, your
  colour. QuickEngine is not mentioned.
- **A Bypass plan for internal use.** Unlimited on everything we pay for ourselves; AI stays
  capped, because that allowance is bought up-front and shared with every customer.
- **Set how your business appears to your customers.** Your display name, support address, logo,
  tagline, accent colour and website now belong to your workspace, and every receipt,
  confirmation and portal page uses them. Until now the support address on your customers'
  emails was ours.
- **Your portal has its own address.** Each workspace gets a slug at
  `portal.quickdash.xyz/<your-business>`, and the page resolves your name and branding from it
  before anyone signs in. Portals stay switched off until you turn one on, and a business you
  have not published cannot be found by guessing.
- **Your logo and your favicon on the portal.** The browser tab shows your icon and your
  business's name, not ours.
- **One portal now serves every business.** Previously a single deployment could only ever
  answer for one workspace. Each business gets its own address, its own branding and its own
  sign-in, from the same place.
- **Connect the account you get paid into.** You can now link your own payment account and
  see whether it is ready to take charges and receive payouts. Until now there was no way to
  connect one at all, which meant no way to be paid through QuickDash.
- **Your payment account is not tied to one company.** Payments were built around a single
  provider; the integration point is now a seam, so adding others later does not disturb what
  already works or the records you have already collected.

### Changed

- **The Teams plan is now called Expand.** Same plan, same price. The name simply did not fit
  beside Launch, Grow and Scale.

### Fixed

- **Custom plans were being held to the free plan's limits.** An account on a negotiated plan
  resolved to the smallest allowance we offer — ten thousand requests and a single seat. The
  largest accounts were the ones affected.
- **Some features were missing from local development.** Credits, integration health, product
  events and saved views existed everywhere except a developer's own machine, so work could look
  broken locally and behave correctly once deployed.
- **A sign-in email that fails to send no longer breaks signing in.** The request now succeeds
  and the failure is recorded, rather than surfacing an error to the person trying to log in.

### Added — earlier

- **The API has a front door.** Visiting `api.quickdash.xyz` used to answer with a not-found
  error for a request that was not wrong. It now greets you and points at the documentation.
- **Credits can be bought.** Balance, top-up and auto-recharge are reachable for the first
  time; the code existed and nothing could call it. Auto-recharge needs both a trigger balance
  and an amount stated explicitly, because it authorises future payments.
- **Changes to your organization are recorded.** Creating or changing a role, inviting or
  removing a member, issuing or revoking an API key, and deleting a workspace now leave an
  entry showing who did it and when.

- **Every list can be sorted.** Records, catalog items, invoices, orders, quotes, bookings,
  payments, shipments, projects, tasks, contracts, files and time entries can each be ordered by
  the columns that make sense for them, in either direction, and paged through without a record
  going missing or turning up twice.
- **We can now see how people actually get on with QuickEngine.** Signup, setup, first real
  outcome, module use, and where search comes up empty are all measured, so it is possible to
  tell where people get stuck instead of guessing. Nothing recorded carries customer names,
  record contents, or anything typed into a search box.
- **Signups record where they came from.** Campaign, source, medium and referring site are kept
  alongside the signup, so it is possible to tell which channels bring people who stay.
- **One workspace can be recovered without affecting anyone else.** Restoring a single
  workspace's data from an earlier point no longer means rolling the whole platform back, so
  other customers keep every change they made in the meantime.

- **A completed appointment can become an invoice.** The service and its price are recorded as
  they were on the day, the invoice arrives as a draft so nobody is billed by accident, and
  raising it twice returns the same invoice rather than charging twice.
- **Saved views.** Filters, sorting and paging for any module list can be named and kept, pinned
  to your home page, and are private to you rather than shared with the workspace.
- **Revenue across the whole organization.** The account console can show what every workspace
  collected and refunded over a period, reconciled to real payments and reported per currency
  rather than added together.
- **A support bundle and a request lookup.** A workspace can produce a diagnostic snapshot to
  send with a support request, and look up exactly what happened under any request id the API
  returned. Neither carries credentials or customer records.
- **Connect now shows when an integration is degraded.** A workspace can see which capabilities
  are running on a stand-in and what stops working, instead of a feature quietly returning
  nothing that looks the same as having no records.
- **Search now finds records across your whole workspace.** Clients, catalog items, invoices,
  orders, quotes, bookings, projects, milestones, shipments, contracts, fulfillments and
  payments are all searchable. Previously only clients were.
- **Teams is now a real tier.** Organizations that outgrow Scale can buy seats directly, with
  every allowance growing as the team does rather than being fixed at the size the plan was
  bought at. Adding or removing a member updates what is billed straight away.
- **QuickDash is now a desktop app.** A Tauri shell wraps the same QuickDash you use in the
  browser, so anything that ships to the web appears in the app without an update, and the app
  itself updates only when the shell genuinely changes.
- **Signing in from the desktop app now happens in your own browser.** Choosing Google or
  GitHub opens your normal browser, and the app is signed in the moment you finish, instead of
  showing the stripped-down sign-in that providers give apps that embed a browser window.

- **Commerce records now keep their working view.** Products, inventory and orders share
  consistent search, status filters, sorting, result counts and pagination, with the current
  view encoded in the URL so it survives refreshes and can be shared.
- **Commerce records now show how work connects.** Catalog items, inventory, orders, payments,
  fulfillments and shipments expose their real related records and the correct module handoff
  without inventing links that the backend does not actually store.
- **Bookings can now use the service catalog.** Operators may associate an appointment with an
  active service, package or rental, and booking details now expose their real client and
  catalog relationships.
- **Every workspace now has a developer Connect path.** QuickDash exposes the canonical API
  origin, workspace identity, safe environment setup, SDK verification example and CLI path;
  Account creates credentials from purpose-based least-privilege presets instead of selecting
  every capability by default.
- **QuickDash now has one operator-first experience contract.** Workspace recipes remain fully
  editable, first-run guidance is tied to real business outcomes instead of fake sample data,
  developers receive a dedicated Connect path, and the redesign now follows a measured,
  accessible sequence rather than disconnected screen changes.
- **Vite deployments now share one validated browser URL contract.** Local development uses
  the documented application ports, while production configuration must provide complete HTTPS
  origins and cannot silently point a deployed app back at localhost.
- **First-run setup now carries customers into their new QuickDash workspace.** New accounts
  name their business, choose and review a starting recipe, create the workspace atomically,
  and land in its orientation and getting-started checklist.
- **QuickDash now runs on Vite, TanStack Router and TanStack Query.** Every operational
  module, workspace search, activity, onboarding, file transfer and public contract signing
  now uses the QuickEngine API without a Next.js server.
- **QuickDash file transfer and signing are available through the API.** Authenticated
  workspace members can upload and download documents, while contract recipients can review,
  sign or decline through their secure link.
- **The account console now runs on Vite, TanStack Router and TanStack Query.** Workspace,
  organization, team, invitation, notification, API-key and billing screens now use the same
  public API and Quick.js client available to customers, with authenticated routes refusing to
  render unless the session can be verified.
- **Quick.js now has a browser-safe entry point.** Browser apps can use session authentication
  without inventing a workspace header, while server-only webhook cryptography stays out of
  client bundles.

### Removed

- **Next.js is gone from the product entirely.** The last dependency, the unused font helper
  and the file-counting boundary check were removed after the Vite migration completed. Nothing
  in the product references Next any more.

### Fixed

- **Deleting a file, a workspace or an account now completes.** Permanently deleted documents
  were left in a pending state forever, which kept their storage counted against the plan and
  made workspace and account deletion fail outright.
- **Analytics events sent from the browser are accepted.** The endpoint returned an error on
  every call.
- **Every list can be sorted from the SDK.** The API accepted sorting and no client could ask
  for it.
- **Rate-limit responses now report the real ceiling.** Every plan except Launch was told the
  wrong number, so a client backing off used a figure that did not match what it was measured
  against.
- **Archived workspaces no longer count against the plan.** Archiving the only workspace on a
  plan left an account unable to create another or remove the archived one.
- **Stored copies of past responses are cleared once they can no longer be replayed.** They were
  kept indefinitely.

- **Seat counts are recorded for accounts created by signing up.** They were only counted when
  an organization was created directly, so a new account reported no seats in use.
- **Plan limits on people and workspaces are now enforced.** Inviting someone or creating a
  workspace beyond what a plan includes is refused with a clear explanation and the two ways
  forward, instead of being allowed silently.
- **Teams accounts get the request headroom they pay for.** The new tier was being held to the
  rate limits of the cheapest paid plan.
- **Database changes can no longer reach development and miss production.** Every change
  committed to the codebase is now checked against the live database automatically, so one that
  never arrived is reported by name instead of surfacing later as a broken page.
- **Seat and workspace limits are now enforced.** Both were listed on every plan and neither
  was ever counted, so an account could hold any number of members or workspaces regardless of
  its tier. Both are counted from the real records, so a missed update can never leave the
  number permanently wrong.
- **The terms and privacy pages now describe the real product.** Plan names match the tiers
  actually sold, usage allowances name the units actually measured, and the provider list
  includes the email and AI providers it had been missing along with a plain description of what
  is sent for AI-assisted setup.
- **The desktop window can be moved and its header is no longer squashed.** The strip macOS
  reserves for its window buttons is now added above the header rather than taken out of it,
  and the top of the window responds to dragging again.
- **Workspaces open again after setup.** Finishing workspace setup could fail with a 500 because
  a database column present in development was missing in production. Both databases now match.
- **Signed-in sessions no longer fail roughly once a day.** A leftover Next.js integration ran
  whenever a session cookie was refreshed and crashed the request. It has been removed.
- **Signing in on the live site no longer loops forever.** Account and QuickDash were still
  routing their API calls to a retired address, so a successful sign-in could not load the
  account behind it and sent people straight back to the sign-in page, over and over. Both now
  reach the current API.
- **A backend outage no longer looks like being signed out.** When the account console holds a
  valid session but cannot reach the API, it now explains the problem and offers a retry
  instead of bouncing to sign-in, which previously produced an endless redirect loop.
- **Disposable workspace data can now be removed deliberately.** Trashed documents expose
  permanent deletion through their durable storage-cleanup workflow, archived projects can be
  restored or deleted, and Account clearly distinguishes reversible workspace archiving from
  permanently discarding a test workspace and all of its data.
- **Getting started now stays completed.** QuickDash records the first completed checklist pass
  per user and workspace, so deleting or changing later business data cannot resurrect
  onboarding that the operator already finished.
- **Account no longer presents fabricated business performance.** The hardcoded Revenue and
  Analytics pages, charts and navigation are gone; organization, workspace, member, module,
  usage and billing figures remain because they come from live Account data. Workspace actions
  now say which workspace they enter.
- **Expected app failures now explain what happened and how to recover.** Auth, Account and
  QuickDash distinguish expired sessions, missing permission, missing or changed resources,
  rate limits, connection failures and server errors instead of presenting all of them as an
  internal error; retries preserve the route and support-ready request IDs remain copyable.
- **QuickDash Files now handles repeat folder creation without breaking the workflow.**
  Folder names that already exist in the same location return a clear conflict instead of an
  internal-server error, successful changes refresh immediately, and pending forms cannot be
  submitted twice.
- **Each Vite app now reports readable errors to its own monitoring project.** Web, Auth,
  Account and QuickDash use isolated local DSNs, QuickDash initializes browser monitoring,
  and production builds upload source maps without publishing them.
- **Password accounts remain password accounts after sign-out.** A verified email-and-password
  customer can end their session and sign back in with the same credentials instead of being
  forced toward an unrelated OAuth method.
- **Account and QuickDash never send production users to local development.** Both authenticated
  apps now validate the complete Vite URL contract during production builds, including workspace,
  account, sign-out, checkout and monitoring links.
- **First-run onboarding stays focused on creating a workspace.** Account setup no longer
  interrupts password users with passkey or two-factor enrollment, and it does not introduce
  pricing or checkout before the customer reaches QuickDash.
- **Vite deployments now build from clean checkouts.** Vercel builds each frontend together
  with its workspace dependencies, so production no longer relies on generated SDK files left
  behind on a developer machine.
- **Marketing and identity no longer embed development navigation in production.** Web and Auth
  use the validated browser origin contract, and their production bundles contain no localhost
  application URLs or legacy QuickEngine browser variables.
- **QuickDash changes refresh in place without session churn or request floods.** Migrated
  module forms now keep a stable router adapter, refresh active TanStack data without rerunning
  the authentication boundary, and no longer exhaust API rate limits after a successful save.
- **Invoice and fulfillment dates now cross the browser API boundary correctly.** ISO date
  strings sent by QuickDash are coerced to domain dates instead of failing validation with a
  400 response.
- **QuickDash now serves its application icon.** Local and deployed Vite pages no longer
  request a missing `/favicon.ico`.
- **Local apps now keep their assigned development addresses.** Starting a second copy fails
  clearly instead of silently moving Account or Auth onto another app's port.
- **Account and QuickDash browser requests now call the native Fetch API correctly.** The
  shared Quick.js client no longer detaches `window.fetch` from its browser receiver, avoiding
  an `Illegal invocation` crash when a Vite app loads authenticated data.
- **Local Auth, Account and QuickDash commands now start their API dependency.** Running
  `pnpm auth`, `pnpm account` or `pnpm dash` no longer leaves the Vite proxy pointing at an
  absent service on port 3020.
- **Account management now verifies the target workspace belongs to the authorized
  organization.** Workspace changes and API-key operations can no longer be aimed at a
  workspace in another organization by substituting its identifier.

### Added

- **Workspaces can now be managed through the API.** Create, rename, archive, delete and switch
  modules on and off without opening the dashboard, so you can build your own onboarding or
  provision workspaces from your own systems. Turning on a module still brings along anything it
  depends on, so a workspace can never end up half-configured.

### Changed

- **QuickDash Home now points to work instead of repeating the sidebar.** The workspace landing
  page shows the next real action, a small set of valid quick actions, setup completion and recent
  activity; the redundant grid of enabled modules is gone.
- **Workspace setup now asks what help the operator wants.** New customers can describe their
  business, choose modules themselves, or start immediately with QuickDash defaults without
  browsing a catalog of business types. Internal recipes still provide editable recommendations
  and now order the first real actions shown inside the resulting workspace.
- **Production job registration now targets the stable QuickDash API domain.** Inngest keeps
  its existing application identity and credentials while future deployments sync through
  `api.quickdash.xyz`.
- **Local Vite apps now share one environment file.** Web, Auth, Account and QuickDash read
  the repository-root `.env.local`, their examples describe the same browser contract, and
  billing configuration uses the current Launch, Grow and Scale plan names.
- **Sign-in methods only link with the customer's consent.** A matching email from Google or
  GitHub no longer silently adds that provider to an existing password account; additional
  methods can still be linked deliberately from an authenticated account.
- **Every app now uses the restored QuickEngine mark.** The shared logo, wordmark, onboarding
  artwork and browser favicons now come from the preferred brand asset instead of the temporary
  placeholder.
- **QuickDash infrastructure now has product-owned names and domains.** Existing Vercel projects
  were renamed in place for Auth, Account and API, and the new `quickdash.xyz` application
  domains were attached without discarding the old rollback aliases.
- **Browser tests now exercise the Vite applications and canonical API directly.** The
  end-to-end harness no longer starts a legacy Next.js server or creates Next build output.
- **Auth and Account now live with the QuickDash product applications.** Their source roots
  moved under `apps/quickdash`, alongside placeholders for public docs, owned support, desktop
  and mobile clients.
- **The marketing site, the sign-in app and identity now run on a faster stack.** Pages load
  quicker and nothing about how you sign in has changed.

### Changed

- **The plans are now Free, Launch, Grow, Scale and Custom.** Named after where your business is
  going rather than the size of our product. Prices and everything included are unchanged at
  $0, $30, $90 and $240, with Custom being a conversation rather than a checkout button.
- **Seat counts corrected** to 2, 5 and 15 on Launch, Grow and Scale, matching the published
  pricing.

### Removed

- **The Team tier has been withdrawn** from self-serve checkout. Accounts of that size are
  better served by a conversation than a fixed package.

### Added

- **Prepaid AI credits.** Buy credit up front and draw it down as you use AI features. Your
  balance is the sum of every movement on your statement, so any number you are shown can be
  explained line by line rather than simply asserted. Top-ups, refunds and expiries all appear
  as their own entries, and nothing is ever removed.
- **Your plan's included AI comes first.** Credits are only ever spent once the AI actions
  included in your subscription are used up, so you are never charged for something you have
  already paid for.
- **A daily AI limit per workspace.** One workspace cannot burn through the whole account, and
  reaching the limit in one workspace never stops the others working.
- **Optional auto top-up.** Off unless you turn it on. If a payment fails it switches itself off
  and tells you why, rather than retrying a card that is not going to work.
- **Work already running always finishes.** Reaching a limit stops the next request, never the
  one in progress, so a request never dies halfway through.

### Added

- **Organizations can create and manage their own roles.** Name a role anything you like and
  choose exactly which permissions it carries; the name is yours to pick and only the
  permissions decide what someone can do. Owner, administrator and member remain built in and
  cannot be renamed, redefined or deleted, so an organization can never lock itself out of its
  own billing. Nobody can create a role granting more than they hold themselves, and a role
  cannot be deleted while people still hold it, which would otherwise strip their access with
  nothing to explain why.

### Fixed

- **Renaming a role no longer removes access for the people who hold it.** Members are carried
  across to the new name as part of the same change, so a rename cannot leave anyone stranded
  without permissions.
- **Team, billing and workspace creation now recognise custom roles.** These screens previously
  understood only the three built-in roles, so somebody holding a custom role with the right
  permission could still be told they did not have it.

### Fixed

- **Events are delivered in the order they happened.** Under load they could be handed to
  subscribers out of sequence, so an update could arrive before the creation it referred to.
  Anything reacting to those events could end up with a wrong picture of what happened.

### Added

- **Custom roles now resolve to real permissions.** A role an organization defines for itself
  can be checked wherever access is decided, rather than only the three built-in roles being
  understood. Built-in roles still take precedence and cannot be redefined, so no organization
  can lock itself out of its own account.

### Added

- **Groundwork for custom roles.** Organizations will be able to define their own roles with any
  name and whatever combination of permissions they choose, rather than being limited to owner,
  administrator and member. The built-in three remain and cannot be removed, so no organization
  can accidentally lock itself out of its own billing, and nobody can create a role granting more
  than they hold themselves.

### Added

- **An automated check that database backups can actually be restored.** It recreates the
  database as it was at a chosen moment, confirms the structure and records came back, reports
  the result, and cleans up after itself. Being able to demonstrate recovery on demand matters
  more than assuming it works.

### Changed

- **Pinned the code formatter to an exact version.** It was allowed to update itself
  automatically, and a newer release would then reject the project's own configuration and stop
  checks from running until someone edited a file by hand. It now moves only when we choose.

### Fixed

- **The development and production databases are verifiably in step again.** Their structures
  were always identical, but the record of which updates had been applied had fallen out of sync
  after the update history was rebuilt at some point. Nothing was broken, but the next database
  update against production would have failed. Reconciled, and there is now a command that
  proves the two agree rather than assuming it.

### Changed

- **Request limits now scale with your plan.** Every account previously shared the same ceiling
  on how fast it could call the API, regardless of what it was paying for. Higher plans now get
  proportionally more headroom, and the free tier is bounded more tightly. This is separate from
  your monthly allowance: it governs how fast you may go right now, not how much you get in total.

### Changed

- **API usage and AI usage are now counted separately.** They were sharing one allowance, which
  meant AI work quietly consumed the same budget as ordinary requests even though it costs
  dramatically more to provide. Each now has its own allowance on every plan, so what you get is
  clearer and neither one eats the other. Plan pages show both.

### Added

- **Plans now have working usage limits.** An account approaching its included usage sees that on
  every response before it becomes a problem, and work already underway is never interrupted.
  Going slightly over is allowed rather than cut off mid-task. Only once well past the limit are
  new requests declined, with a clear reason rather than a generic error. If our own usage
  tracking is unavailable, requests are allowed through — a billing problem should never become
  an outage.

### Added

- **QuickEngine now measures how much of the API each account uses.** This is measurement only —
  nothing is limited, nothing is charged, and nothing changes for anyone using the product. It
  exists so that usage allowances can eventually be set from real numbers rather than guesswork.
  Requests that are rejected, and checks used only to confirm the service is running, are never
  counted.

### Fixed

- **A payment confirmation that arrives twice no longer creates two payments.** Payment providers
  routinely deliver the same notification more than once. Where a repeat could previously produce a
  duplicate record, or fail outright, QuickEngine now recognises it and returns the original
  payment unchanged. The database enforces this as well, so a duplicate cannot be recorded even if
  two notifications arrive at the same instant.

### Added

- **Orders now hold stock, so the same item cannot be sold twice.** Placing an order reserves what
  it needs, cancelling gives it back, and fulfilling it takes the goods off the shelf. Until now
  nothing connected the two, so two customers buying the last item both succeeded. Stock is held
  from the moment a customer commits rather than when an order is later confirmed, because that gap
  is where overselling happens. Businesses that deliberately sell beyond available stock, such as
  those taking backorders, can allow it in their inventory settings; by default it is refused.
  Workspaces that do not track inventory, and products that are not tracked, are unaffected.

### Changed

- **The component scaffolding tool is no longer part of a production install.** A
  development-only command-line tool was listed among the packages QuickEngine ships, so it was
  pulled into production builds despite never running there. It is now correctly marked as a
  development tool, and the two apps that use it are aligned on the same version.

### Security

- **Updated a pattern-matching library to a patched release.** A dependency used by build tooling
  could be made to exhaust memory and crash the process when given a specially crafted pattern.
  QuickEngine only ever supplies its own patterns, so this was not reachable in practice, but the
  affected copy now points at the fixed release.

### Fixed

- **An invoice can no longer be paid more than once for the same money.** When a payment was
  recorded as pending and later confirmed — the path card payments take once a provider reports
  success — the amount was never checked against what the invoice still owed. A confirmation that
  arrived twice could push an invoice past its total and leave it showing more collected than was
  ever charged. Confirming a payment now applies the same balance check as recording one, and a
  confirmation against a voided invoice is refused outright.

- **Writing to the API works again.** Every request that sent data to the API — creating a client,
  authorizing a live connection, receiving a payment notification — waited without ever being
  handled and eventually gave up. Reading was unaffected, so the service looked healthy while
  nothing could be saved through it. Requests carrying data are now read correctly and answered
  straight away.

### Added

- **A misconfigured background service can no longer fail quietly.** Realtime, background jobs, and
  search each fall back to an offline stand-in when their credentials are absent, which is what lets
  the whole product run on a laptop with no network. In a live deployment that same fallback used to
  be invisible: work could be accepted and then discarded with nothing reported anywhere. A live
  deployment now says so plainly in its logs, naming what stopped working and why, and reports itself
  as not ready to serve traffic whenever the failure is one that loses work rather than one that
  merely disables a feature.

### Security

- **Updated the CSS build tool to a patched release.** A pinned version of PostCSS could be made to
  read files outside the project when processing a stylesheet's source-map reference. QuickEngine
  only ever builds its own stylesheets, so this was not reachable in practice, but the pin now
  points at the fixed release.

### Changed

- **Background work now runs on the QuickEngine API.** Scheduled delivery of events and webhooks
  used to be handled by the dashboard; it now runs on the API service alongside everything else it
  serves.

### Changed

- **Live updates now authorize against the QuickEngine API.** Realtime subscriptions used to be
  approved by the dashboard itself; that check now lives in the API alongside every other permission
  decision, so there is one place that decides who may listen to a workspace's events instead of two
  that could drift apart.

### Fixed

- **Client records update live again.** Renaming events in the previous release stopped the client
  list noticing changes made in another tab or by a teammate, so it sat stale until the page was
  reloaded. It now refreshes as changes happen, and also catches up after a dropped connection.

### Added

- **The API reference now describes what it sends back.** Every endpoint documents the exact shape of
  its response, checked against the code so the reference cannot drift from reality, and every
  endpoint that accepts data carries a worked example that is verified to be something the API would
  actually accept. Fields the API deliberately withholds — signing secrets among them — cannot appear
  in the documentation, and that is enforced automatically rather than by review.

### Added

- **Start a project in one command.** `quick create app` generates a working project — the SDK
  installed, credentials in place, and a single file showing a read and an idempotent write, so
  running it twice doesn't create two of anything. It is short enough to read in one sitting and
  makes no assumptions about the rest of your stack.

- **The CLI sets itself up and guides you through it.** `quick init` walks through connecting to a
  workspace and checks it works before saving anything, so a mistyped key fails during setup instead
  of on some unrelated command later. Running `quick` on its own now opens a menu of everything it
  can do, built from the real commands, so nothing has to be memorised. Scripts and pipelines are
  unaffected — they still get the usual help output.

### Added

- **The API now documents itself properly.** Every endpoint that accepts data describes exactly what
  it expects, generated from the same rules the API validates with, so the reference cannot quietly
  fall out of step with the behaviour. Responses say which version answered, and anything scheduled
  for removal is announced in the response itself with at least six months' notice.

- **Read what happened while you were away.** The workspace event history is now available from
  Quick.js and the CLI, including everything after a given point — so an integration that was
  offline can catch up precisely instead of refetching everything.

### Added

- **Nothing is missed after a dropped connection.** Live updates are a hint to refresh, not the
  record of what happened, so a browser that was asleep, offline, or mid-deploy used to silently fall
  behind with no way to notice. The activity feed can now be read from any point onward, and the
  client is told when its connection came back, so it catches up on exactly what it missed instead of
  guessing or reloading everything.

- **Outbound webhooks.** A workspace can now register its own URLs and receive its events as they
  happen, filtered to the event types it cares about or subscribed to everything. Each request is
  signed so the receiver can prove it came from QuickEngine and was not altered in transit, and the
  signature expires, so a captured request cannot be replayed later. Failed deliveries retry on their
  own with widening gaps, an endpoint that stays broken is switched off rather than retried forever,
  and every attempt is kept with the response so a developer can see exactly what their server
  returned. Any delivery can be sent again on request. Managed from the API, Quick.js, or the CLI,
  and the SDK ships the signature verifier so receivers do not have to write their own.


- **Reporting and Analytics now has an API, completing the module set.** A cross-module snapshot
  reports clients, invoices, payments, revenue, orders, fulfillment, projects, bookings, contracts,
  inventory, and site traffic for any date range, and every section says whether that module is
  switched on — so "nothing happened" is never confused with "not enabled". Revenue is always
  reported per currency and never summed across them. Traffic ingest moved to the API, keeps its
  privacy guarantees, and stays safe to retry. Quick.js, the lean CLI, and the QuickDash reporting
  screen now follow the same contracts.

- **Files and Documents now has a durable API for folders and document records.** Routes cover
  creating, renaming, and moving folders, editing document details, moving a document through
  active, archived, trashed, and deletion, releasing a quarantined version, and removing an
  attachment, each committing domain state, audit, and outbox together. A folder can't be moved
  inside itself or deleted while it still holds anything, a document must be trashed before it can
  be deleted, and the storage cleanup that follows a deletion is only scheduled once the request has
  actually been saved. Internal storage addressing is never returned. Quick.js, the lean CLI, and
  the QuickDash files screen now follow the same package contracts. Uploading keeps its own
  reserve-store-verify sequence so a failed transfer can never leave a half-written record.

- **Contracts and E-sign now has a durable agreement API.** Routes cover creating a draft, editing
  it, sending it for signature, expiring, voiding, superseding it with a revision, and deleting a
  draft, each committing domain state, audit, and outbox together. Signing links are treated as
  credentials: they are never returned by the API, never written to the audit trail, and never
  stored where a retry could replay them. Quick.js, the lean CLI, and the QuickDash agreements
  screen now follow the same package contracts.

- **Bookings now has a durable scheduling API.** Routes cover booking a slot, rescheduling one that
  hasn't started, moving it through requested, confirmed, checked in, completed, cancelled, and no
  show, and deleting one that never went ahead. Two live bookings can never overlap on the same
  schedule, the same clock time stays free on a different one, and cancelling releases the slot for
  rebooking.

- **Time Tracking now has a durable API.** Routes cover logging time manually, running timers,
  the draft to approved to invoiced lifecycle, voiding time instead of deleting it, and attaching
  or detaching approved billable time on a draft invoice. Retrying a start request replays the same
  timer rather than opening a second one, approved time can no longer be quietly deleted, and time
  and invoice move together in one transaction so time is never marked invoiced against an invoice
  that did not change.

### Added

- **Projects and Tasks now has a durable delivery API.** Routes cover projects, the milestones
  inside them, and tasks that can nest under other tasks, each committing domain state, audit, and
  outbox together. Finished work is protected on the way out: a project must be completed or
  cancelled before it can be archived, and archived before it can be deleted, a milestone can't be
  removed while it still holds tasks, and a task can't be removed while it still has subtasks. A
  task can be re-parented but never made its own ancestor. Quick.js, the lean CLI, and the
  QuickDash projects screen now follow the same package contracts.

### Removed

- **The unused hosted checkout path is gone.** Billing kept a second, uncalled way to start a
  subscription alongside the payment form Account actually uses. Two competing checkout paths in
  one place is a hazard when money is involved, so the dead one was removed.

### Fixed

- **Quote and invoice problems now explain themselves instead of failing as server errors.**
  Fifteen ordinary outcomes, including deleting a quote that isn't a draft, accepting one that
  can't be accepted, an invoice with no lines, and out-of-range quantities or prices, were being
  reported as unexpected server errors. They now return the right status with a readable
  explanation, and a new check keeps every module's failures classified so this can't come back.

### Changed

- **Events now survive a restart.** Every change a workspace makes records its event in the same
  transaction as the change itself, and a scheduled dispatcher delivers it afterwards. Before, the
  activity feed and search index were updated by whichever server happened to handle the request, so
  a restart at the wrong moment lost the update silently. Delivery now retries on its own, backs off
  when something downstream is struggling, and a single failing consumer no longer stops the others
  from getting their events.

- **Removed the last duplicate write paths left over from the API migration.** Eleven superseded
  module functions are gone, so every quote, timer, and file-deletion write now runs through the one
  durable path that records an audit entry and an event alongside the change. Behaviour is unchanged;
  there is simply no longer a second way in.

- **New QuickEngine logo across every app.** The redrawn brand mark replaces the old one everywhere
  it appears, and it now doubles as the browser tab icon, so the separate favicon file is gone and
  all four apps ship a single logo asset. The full QuickEngine lockup ships alongside it for the
  places that need the name spelled out.

- **Stripe billing now runs on the QuickEngine API.** The Stripe webhook moved off the marketing
  site onto the API service at `/webhooks/stripe`, keeping signature verification on the exact
  bytes Stripe sends. An invalid signature is refused outright, while a temporary failure asks
  Stripe to redeliver, and the subscription handlers stay safe to replay. The unused hosted
  checkout endpoint was removed in favour of the payment form already built into Account, and
  every plan price is now declared in the environment contract so a missing one is caught at
  startup rather than at a customer's checkout.

### Added

- **Shipping now has a durable dispatch API.** Routes cover creating a draft shipment against a
  confirmed order, editing it, moving it through ready, shipped, in transit, delivered, exception,
  and cancelled, correcting carrier tracking, and deleting one that never went out. A shipment can
  never send more units than the order has left, tracking locks once a shipment is delivered or
  cancelled, and the delivery record behind it moves in the same transaction, so the two can never
  disagree. Quick.js, the lean CLI, and the QuickDash shipping screens now follow the same package
  contracts.

- **Inventory now has a durable stock API.** Routes cover tracking a catalog item or variant,
  changing its low-stock threshold, archiving and restoring it, deleting one that never moved, and
  reading its movement history. Balances are never set directly: every change is a recorded
  movement that commits alongside audit and outbox, so the history always explains the number.
  Overselling available stock and releasing more than is reserved are both refused, and a movement
  can carry its own reference so the same real-world event is never counted twice. Quick.js, the
  lean CLI, and the QuickDash inventory screens now follow the same package contracts.

- **Fulfillment now has a durable delivery API.** Routes cover opening a delivery, moving it
  through pending, in progress, fulfilled, failed, and cancelled, and deleting one that has not
  started, each committing domain state, audit, and outbox together. Linking a delivery to a paid
  invoice or a succeeded payment is verified in the same transaction, and a record can only ever
  have one delivery. Quick.js, the lean CLI, and the QuickDash fulfillment screens now follow the
  same package contracts.

- **Orders now has a durable commerce API.** Routes cover draft create and edit, the draft to
  placed to confirmed to processing to fulfilled status machine, cancellation, delete, and opening
  the fulfillment record a confirmed order is delivered through, each committing domain state,
  audit, and outbox together. Client and catalog references are verified inside the same
  transaction, so a bad reference leaves nothing behind. Quick.js, the lean CLI, and the QuickDash
  order screens now follow the same package contracts.

### Fixed

- **Editing a catalog item, variant, quote, or invoice in QuickDash now saves.** The edit forms
  left out the retry key their save step required, so every edit failed with a validation message
  no correction could satisfy. Creating those records was unaffected.

- **Invoicing and Payments now have durable APIs.** Invoicing gains guarded routes for draft
  create, edit, the draft to sent to paid to void status machine, and delete, each committing
  domain state, audit, and outbox together. Payments gains routes to record a payment, move its
  status, and issue full or partial refunds, with the same durable guarantees. Quick.js, the lean
  CLI, and the QuickDash invoice and payment screens follow the same package contracts, and both
  modules share one transaction-scoped implementation between their standalone and API paths.

- **Quotes and Estimates now has a full lifecycle API.** Durable commands cover creating,
  editing, sending, accepting, declining, deleting, and converting a quote into an invoice or an
  order, each committing domain state, audit, and outbox together. Hono adds guarded routes with
  private read and write capabilities, and Quick.js, the lean CLI, and the QuickDash quote screens
  now follow the same package contracts. The conversion into invoices and orders runs in one
  transaction and records the converted event.

- **Products and Services now has a full catalog API.** Package-owned durable commands cover
  catalog items and their variants with SKU uniqueness, the draft to active to archived status
  machine, archive before delete, and variant parent rules, each committing domain state, audit,
  and outbox together. Hono adds guarded CRUD, status, and variant routes with a new catalog write
  capability, and catalog reads are audience aware: a publishable storefront key sees only active
  items and variants, while secret keys and sessions see every status. Quick.js, the lean CLI, and
  the QuickDash catalog screens now follow the same package contracts. A shared domain error
  contract maps business failures to stable API responses across modules.

- **Client Records now has the durable foundation for public writes.** Additive Postgres
  tables persist mutation replay results, audit evidence, and versioned outbox events in the
  same transaction as client and address changes. Package-owned commands cover workspace-
  scoped clients and addresses, while Hono adds private read/write capabilities and guarded
  CRUD routes with validation, budgets, tenant/module authorization, deadlines, and required
  idempotency keys. OpenAPI, Quick.js, the lean CLI, and QuickDash compatibility actions all
  follow the same package-owned contracts, and the production API artifact boots on plain Node.

- **API writes now have enforceable reliability contracts.** The Hono boundary caps actual
  streamed request bytes, propagates cooperative deadlines, reports bounded dependency
  readiness, and provides atomic Redis/Upstash counters for tenant- and principal-scoped route
  budgets. Durable mutation contracts require canonical input fingerprints, replayable results,
  append-only audit intents, and outbox events to commit with domain state before any module
  write can be exposed. The shared Postgres client now bounds pool size and connection, query,
  lock, idle-transaction, idle-connection, and connection-lifetime waits; the production API
  artifact also bundles internal TypeScript boundaries so plain Node can start it reliably.
  CI freezes the existing Next compatibility surface at 26
  server-action files and 17 route handlers so future module slices can reduce it without
  quietly adding new framework-owned business logic.

- **The API now has a shared security and observability core.** Reusable contracts define
  stable envelopes, error codes, headers, pagination, and OpenAPI schemas. Hono routes can
  authorize Better Auth sessions or correctly channeled API keys against workspace roles,
  capabilities, enabled modules, and tenant boundaries while carrying an explicit audit actor.
  First-party cookie writes receive origin-based CSRF protection, and requests emit redacted
  structured logs, server timing, OpenTelemetry spans, and optional Sentry diagnostics without
  recording credentials or customer identifiers in route labels.

- **QuickEngine now has an independent Hono API foundation.** The runtime-neutral service
  provides standard response and error envelopes, request IDs, credential-safe CORS and
  security headers, health/readiness/version endpoints, an initial OpenAPI document, a local
  Node entry point, and a Vercel-compatible export. It joins the pnpm/Turborepo graph with
  focused tests before authentication, database access, and module routes are introduced.

- **Onboarding now has a real browser-level release contract.** An isolated Playwright path
  proves required email verification, optional setup branches, the no-billing/no-2FA minimal
  path, default modules and free access, atomic rollback and retry, direct authenticated
  QuickDash entry, orientation/checklist sequencing, and creation of the first useful client.
  The measured local path reaches QuickDash and first value comfortably inside the two- and
  five-minute targets without interfering with normal development servers.

### Changed

- **The developer platform now has an explicit incremental delivery contract.** The Hono
  backend extraction is divided into independently reviewable foundations, module verticals,
  developer surfaces, and a measured Vite proof. Every slice carries a complete cross-agent
  implementation checkpoint so backend work can continue safely across sessions without
  confusing planned architecture with shipped behavior.

- **Getting started now shows the real steps inside each business goal.** Parent goals expand
  into status-derived substeps, the next required action is emphasized, and progress counts
  required milestones rather than clicks. Optional Account security and 2FA guidance links out
  without blocking business completion. The success state remains visible until the user chooses
  **Start Building**, creating an explicit handoff into their finished workspace. The guide
  opens with every goal collapsed and behaves as a single-open accordion, while its collapsed
  launcher uses a solid surface instead of blending into the dashboard.

- **Getting-started substeps now resolve from real workspace status.** Twenty-three supported
  milestones derive completion from module records and meaningful transitions such as sent,
  confirmed, approved, fulfilled, and dispatched. A deterministic resolver selects the first
  unfinished required substep while optional guidance never blocks a parent business goal.

- **Quick.js, the CLI, and all 15 shipped modules now have independent SemVer release
  automation.** Conventional package commits feed one reviewed Release Please PR, with
  fixes producing patches, features producing minors, and breaking changes producing
  majors. Component-prefixed tags keep all 17 package releases separate from product
  CalVer. Their manifests now declare the intended public npm access, while actual npm
  publication remains disabled until the shared dependency graph and credentials are
  deliberately made publish-ready.

- **Product releases now version themselves.** Every successful `main` CI run publishes
  the merged commit as the next monthly CalVer tag and GitHub Release, beginning with
  `2026.7.1` and resetting the counter each month. The workflow is serialized and safe
  to rerun, uses generated release notes, and leaves future npm package SemVer separate.

- **CI now caches Turborepo's task results between runs.** The pnpm store was already cached, but Turbo's own cache was not — so every push recomputed typecheck, test, and build for all 45 tasks from cold, even when the change touched two files. Restoring `.turbo` lets Turbo skip everything whose inputs genuinely did not change. Measured locally: a cold typecheck takes 19s, a warm one 0s; build is the larger share of CI time and behaves the same way. Uses the local cache via `actions/cache` — no Turbo account, token, or external service. The cache compounds and Turbo never prunes it, so a note in the workflow records that GitHub's 10GB LRU eviction is what keeps it bounded, and what to do if the restore step ever becomes slower than the work it saves.

### Added

- **Getting-started goals now describe the real steps behind each first outcome.** All 14
  actionable first-wave modules declare ordered, versioned milestones such as drafting and
  sending an invoice, confirming a booking or order, and starting then completing fulfillment;
  Reporting remains explicitly outcome-free. Optional Account security and 2FA guidance stays
  outside the module dependency graph and cannot block the business path.

- **New QuickDash workspaces now offer a short, optional orientation.** Four concise
  coach cards introduce the workspace switcher and module navigation, then point to workspace
  settings and Account in a fourth step. Stable target attributes and directional notches keep
  each compact, light-gray card attached to the control it explains. People can skip, finish,
  or restart the orientation from their profile menu; the outcome persists per user and
  workspace so it does not repeatedly reappear across devices.

- **QuickDash now turns first-value guidance into a live workspace checklist.** A compact
  bottom-right panel selects up to five actions from the workspace's enabled modules, links
  into the owning module, and checks each item only after its real business record exists.
  Progress, collapse, and dismissal are accessible and persist per user and workspace. When
  every action is complete, a short success state offers **Start building** and closes itself
  automatically if left alone.

- **The QuickDash getting-started checklist now has durable per-user state.** Collapsed
  and dismissed preferences are stored independently for each user and workspace, survive
  refreshes and devices, and reset safely when a materially new checklist version ships.
  Real action completion remains derived from business records rather than stored checkmarks.

- **Getting-started actions can now complete from real workspace records.** QuickDash
  maps every declared first action to its owning module's workspace-scoped data and checks
  only the short resolved action list in parallel. Completion comes from creating the real
  business record, never from clicking a checkbox. Inventory uses a direct existence query
  so confirming a stock adjustment does not scan every inventory item's history.

- **All 15 built modules now make an explicit first-action decision.** Fourteen modules
  declare one truthful record-producing action, including adding a client or offering,
  creating a quote/project/booking/invoice/order/contract, recording stock/time/payment,
  and beginning fulfillment/shipping. Prerequisites follow the real module dependency graph,
  so an impossible action cannot leak into a workspace checklist. Reporting intentionally
  declares no action because opening a chart is not a business outcome. Catalog tests enforce
  explicit coverage, stable ownership, unique IDs, reachable prerequisites, the universal
  client-to-fulfillment sequence, and recipe filtering.

- **Getting-started actions now have a shared, dependency-safe contract.** Module manifests
  can declare versioned first-value actions with stable IDs, destinations, intents,
  priorities, and action prerequisites. A deterministic resolver builds a short checklist
  from the workspace's actual enabled modules, honors recipe ordering where available,
  removes actions whose prerequisites are unavailable, keeps prerequisites ahead of their
  dependents, and rejects duplicate IDs, ownership mistakes, and cycles. This is the tested
  truth layer for the later collapsible QuickDash checklist; it does not yet render UI or
  treat clicking an item as completion.

- **AI onboarding is now an authenticated, review-first path instead of a mock.** After
  signup, the user can optionally describe their business, request a recommendation, review
  every resolved module, edit it, and use the existing atomic workspace creation path. The server accepts
  only real recipe IDs, caps descriptions and model output, allows three requests per user
  per hour and 500 globally per day, fails closed when shared rate limiting is unavailable,
  and falls back to deterministic catalog matching when no provider is configured or the
  response is invalid. The new text-only Anthropic adapter defaults to Claude Haiku 4.5,
  forwards cancellation/output limits, accounts for token cost, and returns stable errors
  without leaking provider response bodies.

- **Returning users now skip the marketing homepage.** A valid shared QuickEngine session
  at `quickengine.xyz` redirects to Account, which remains the stable control plane and
  routes incomplete accounts into onboarding. The marketing hero is marketing-only again:
  its old fake prompt and fake plan recommendation are gone, replaced by signup and sign-in
  entry points. Direct-to-QuickDash return can follow once a real last-workspace preference
  exists instead of guessing which business the user meant.

- **Rate limiting on the public API.** `/api/v1/*` had none, and `POST /api/v1/events` accepts a **publishable key — a credential deliberately shipped in browser code, so its value is public by design.** An unmetered public write endpoint with a public credential was the sharpest edge the backend audit found. Limits are enforced at the shared route gate, so every current and future route inherits them rather than each having to remember: 600 reads/minute, 120 writes/minute, and a tighter 300/minute on telemetry. Budgets are keyed to the **API key or user, not the IP** — otherwise one customer behind a shared NAT throttles their neighbours, and a caller could dodge their own limit by rotating source addresses. Responses carry `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` on success too, so a well-behaved client slows down *before* it starts getting 429s; a rejection adds `Retry-After`. Authorization runs first so the budget can be charged to a known caller; the expensive work all sits behind the check. **It fails open** — if Redis is unreachable the request is allowed and the failure logged, because an Upstash blip taking the whole API down is worse than a brief unprotected window. Verified against live Upstash, watching the sixth request in a limit of five actually get rejected.

### Added

- **Redis is wired — the cache is real, and can count atomically.** `@quickengine/cache` was a 31-line in-memory seam despite Upstash being in the stack. It now selects a provider from the environment like every other external service: **Upstash over REST** when its credentials exist (production runs on Vercel, where a TCP socket per invocation exhausts connection limits), **TCP Redis** via `REDIS_URL` for local docker, and **memory** for tests — with `CACHE_DRIVER=memory` to force the offline provider. The seam also gained `increment(key, windowSeconds)`, because **rate limiting cannot be built on get/set**: read-then-write is a race, so two concurrent requests both read 4, both write 5, and a limit of 5 admits 6. Redis `INCR` is atomic. Verified against the live Upstash instance, not assumed. Also fixes a real bug in the memory provider — `set` accepted a `ttlSeconds` option and silently ignored it, so nothing ever expired and a "one minute" window lasted the life of the process.

### Fixed

- **Sentry was sampling every transaction, and couldn't tell preview traffic from real users.** `tracesSampleRate` was `1.0` across all four apps; Sentry bills on spans, so that is a cost problem the moment traffic arrives — now `0.1`. No `environment` was set either, and because Vercel preview deployments build with `NODE_ENV=production` they *do* report — meaning our own preview testing landed in the same stream as customer errors, defeating the point of watching it. Both now tagged from `VERCEL_ENV`.

### Removed

- **`@quickengine/monitoring` deleted.** A 20-line provider seam with a console implementation that nothing imported — no package depended on it, no source referenced it. Error monitoring is handled directly by `@sentry/nextjs` in each app, which is where Next.js expects it. Removing the unused abstraction rather than wiring a second path to the same destination.

- **Onboarding's module picker actually does something now.** It was decorative: `completeOnboarding` never sent the selection, and workspace creation hardcoded the foundation set — so whatever a user ticked, they got exactly Client Records, Invoicing, Payments, and Fulfillment. Verified against the database before and after. The chosen modules are now passed through and persisted, with unknown ids discarded server-side (the list crosses a trust boundary from the browser) and dependencies resolved by the registry, so enabling a module brings its prerequisites with it.
- **Onboarding no longer hides the dependency chain.** Because the server resolves dependencies regardless, a user could untick Fulfillment, select Shipping, and silently get Fulfillment back — Shipping requires Orders, which requires Products & Services and Fulfillment, which requires Payments. The picker now mirrors the server's rules: selecting a module pulls its requirements in visibly, a module something else depends on can't be unticked (and says what needs it), and each card lists what it requires. The new Review step shows the full resolved set before anything is created, so the first place a user learns what they actually got is no longer the database.

- **Onboarding no longer misrepresents which modules exist.** Its module list was hand-maintained and had drifted badly: it offered **5 of the 15 built modules**, showed a "Coming soon" padlock on **five that had shipped weeks earlier** (Files, Bookings, Orders, Inventory, Projects), omitted five more entirely (Products & Services, Quotes & Estimates, Contracts & E-sign, Shipping, Time Tracking), and still forced the four foundation modules on as `required` — the rule deliberately removed when the hard lock was lifted. The picker is now **derived from the real module registry**, so shipping a module makes it appear automatically and this class of drift can't recur. Every built module is selectable, foundation included; the twenty planned second-wave modules are listed, labelled, and deliberately not selectable, so the grid is shaped for the catalog's real eventual size instead of today's. Business types now map to explicit starting recipes rather than a hidden required-flag. Derived on the server so the registry — which imports every module package and its schemas — stays out of the browser bundle.

- **Tests can no longer truncate a production database.** `resolveTestDatabaseUrl()` swapped the database *name* but inherited the *host* from `DATABASE_URL` — so with `.env.local` pointed at Neon, every suite would have run against a test-named database **on production**, and these suites call `truncateAll()` between tests. Its own docstring claimed this was "impossible", which is the kind of false confidence that makes a footgun dangerous. The guard now lives inside the resolver itself, so all **sixteen** vitest/playwright configs inherit it rather than each needing their own; `ALLOW_REMOTE_TEST_DB=1` opts out deliberately. Verified by pointing it at a Neon-shaped host and watching it refuse. The bespoke guard added to the e2e config earlier is now redundant and was collapsed into this one.
- **Hydration mismatch on authenticated workspace pages.** Money and dates were formatted with `Intl.NumberFormat(undefined, …)` / `Intl.DateTimeFormat(undefined, …)`, where `undefined` means "use the runtime's default locale" — and Node's default doesn't necessarily match the browser's. Server and client rendered different text for the same value, so React discarded and regenerated the tree on every affected page. Fixed as a class rather than an instance: a shared `formatMoney` / `formatDate` / `formatNumber` in `@quickengine/ui/lib/format` with a pinned locale, now used everywhere the old pattern appeared. Confirmed with the e2e harness, which was what surfaced the error in the first place. Trade-off recorded in the file: a pinned locale means formatting no longer follows the viewer's locale — when real i18n lands, the locale must be resolved on the **server** and passed down, never read during client render, or the mismatch returns.

### Changed

- **Onboarding's six hardcoded business types became a searchable catalog of 52 recipes.** The old picker was a fixed grid of six — fine for six, useless at thirty, and impossible to extend without editing a TypeScript object. Recipes are now data (`_lib/recipes.ts`) with names, categories, keywords, module sets, and a declared opening sequence, rendered as a search box over ten grouped categories. Searching matches keywords as well as names, so "gems", "sparky", "airbnb", "ebay" and "cpa" all find their trade. **A recipe is a recognition surface, not a unique configuration** — a plumber, an electrician and an HVAC technician all want the same modules, but a plumber needs to *see* "Plumbing" to believe the product understands them; recipes therefore share module sets by composition, and the marginal cost of adding one is a single entry. Each recipe also declares its `firstActions` — nothing renders them yet, but it means the getting-started checklist becomes a rendering job later instead of a data migration. No database migration is required.

- **Onboarding now hands the user to QuickDash, and offers a way to skip configuring entirely.** Finishing onboarding used to drop people in the account console, leaving them to find the workspace they had just created — the acceptance criteria have always said it should open the workspace directly, and it now does (a plain link, since QuickDash is a different origin; the account console remains available as a secondary link). A **"Skip — use sensible defaults"** option goes straight from the set-up step to Review with the foundation modules selected: the acceptance criteria make business type optional, and this is what optional means in practice — the only route that plausibly finishes in under two minutes for someone who doesn't yet know what a module is. The **"Set it up for me"** AI option returns as a clearly-labelled preview panel rather than a disabled button, deliberately styled with no hover or focus affordance so it reads as roadmap instead of inviting a click that does nothing. Back navigation now tracks how the user actually configured rather than inferring it from whether a business type was picked, which sent anyone who skipped "back" to a screen they had never visited.

- **Onboarding restructured to Name → Set up → Configure → Review → Success.** The first thing a new user saw was a choice where one card read "Coming soon"; the AI option is now simply absent until it exists. Business type and module selection were two steps doing one job (type preselected modules, then the user picked modules anyway) — they are now one branching step: use a preset, or choose modules yourself. The module list, which had become 35 full-width rows, is a two-column grid split into "Available now" and "Coming soon". A new Review step shows exactly what will be created with an escape hatch back to editing, so reconfiguring before committing is real rather than implied. Step count is unchanged at four plus success — the previous flow never read long because of its length.

### Added

- **`agents.txt`, plus robots coverage across every app.** QuickDash now serves **`/agents.txt`** — a machine-readable integration guide a user can point their AI coding agent at instead of pasting documentation. It covers the base URL, the `QuickEngine-Workspace` / `QuickEngine-Publishable-Key` header contract, the three real `/api/v1` routes, the `@quickengine/quick` SDK, `QuickApiError`, and the integer-cents money convention — and it explicitly warns against putting a `qsk_` secret key in browser code. It is a route handler rather than a static file so the base URL comes from configuration. **The rule written into the file: document only routes that exist** — an agent cannot tell a planned endpoint from a real one and will confidently generate code against whatever it reads, so it names the three that exist and says to ask the user for anything else. Separately, **auth, account, and QuickDash had no `robots.txt` at all**, leaving sign-in pages and app shells crawlable; all three now disallow everything, with `/agents.txt` as QuickDash's deliberate exception. (Robots is advisory — the auth gate is the actual protection.) The marketing site gains a `humans.txt` that points at `agents.txt`.
- **Step 6 is complete — all five required browser coverages now exist.** Stale data, multi-tab changes, and rapid workspace/module switching join the retry and double-submit flows already covered. **Stale data** guards against a lie rather than an error: editing a record someone else deleted must report honestly instead of closing the dialog as though it saved. **Multi-tab** asserts two views of a workspace converge on truth and never double-create; the live-push half is a separate test that skips itself unless `PUSHER_APP_ID` is set, since realtime falls back to a no-op provider without keys — so it exercises real Pusher locally and can never flake where keys are absent. **Rapid switching** bounces between two workspaces the same user owns without letting either render settle, then asserts neither page ever shows the other's records — a tenant-isolation check, not just a UI one — plus the same for module pages within a workspace. Fixing these also surfaced test coupling worth avoiding in future: the stale-data flow originally deleted the shared fixture client and broke the switching flow, so destructive tests now create their own throwaway records. No database migration is required.

- **Browser coverage for the retry and double-submit reliability contracts (step 6, Phase B).** The Playwright harness gained a real signed-in session and its first two flows. A setup project seeds a verified owner, workspace, client, and issued invoice, then mints a genuine session by driving Better Auth as a library (`signInEmail`) — QuickDash doesn't host the auth handler, so there is nothing to sign in against over HTTP, and nothing about the cookie format is reimplemented. **The retry test is the one that matters:** it mistypes a payment amount, corrects it, resubmits, and asserts the payment actually exists — the silent-data-loss regression, finally proven in a browser instead of only at the data layer. It was verified to genuinely catch the bug by removing `releaseIdempotencyKey` and watching it fail, with the dialog reporting success while zero payments existed. The double-submit test asserts the button locks while in flight; an earlier version tried to click twice and Playwright timed out waiting for the control to re-enable, which is the guard working, so the test now asserts that directly. e2e also never sends email — `RESEND_API_KEY` is stripped from its environment, since the email package only falls back to the console provider when that key is absent. No database migration is required.

### Fixed

- **A failed create no longer swallows the user's retry (idempotency correctness).** The idempotency guard claimed its key *before* doing the work, and the create forms only mint a fresh key after a **success** — so a first attempt that failed for an ordinary reason (a mistyped payment amount, a bad invoice line, a booking that collides with another) burned the key permanently. When the user corrected the form and resubmitted, the retry carried the same key, lost the claim, and was treated as a duplicate: the dialog closed and reported success while **nothing was ever created**. Silent data loss on invoices, payments, and every other guarded create. A claim now means "this caller is doing the work", not "the work happened" — the new `releaseIdempotencyKey` gives the key back whenever the work fails, so the corrected retry goes through, while a genuine duplicate of a *successful* create stays blocked exactly as before. Wired into all six guarded paths (Client Records, Payments, Orders, Invoicing, Quotes & Estimates, Bookings). Covered by four new integration tests, including the fail-then-retry sequence that regressed. One narrower window remains and is tracked, not fixed here: two *concurrent* identical submits where the winner then fails — the loser has already returned success. Closing that requires the claim row to carry the outcome so the loser waits on it; it needs a genuine double-fire, which the client-side pending-disable already guards. No database migration is required.

### Changed

- **Onboarding is shorter — removed the 2FA and plan-selection steps.** First-run onboarding no longer asks the user to set up two-factor auth or pick a billing tier; it goes straight from "what are you building" → modules → create workspace. Faster time-to-value; 2FA lives in Account → Security and upgrading lives in the dedicated `/billing/plans` page, both opt-in later. (A fuller onboarding rework is planned separately.)
- **Org avatar is now consistent across apps and persistent per org.** The QuickDash workspace switcher previously seeded its avatar from the *workspace* id, so it changed as you switched workspaces and didn't match QuickEngine's account switcher. It now seeds from the *org* id in the same format as the account app — so your org avatar is identical in QuickEngine and QuickDash and stable across every workspace in that org, while your personal (user) avatar stays distinct and consistent everywhere.
- **Removed the hard lock on the four "foundation" modules.** Client Records, Invoicing, Payments, and Fulfillment are no longer permanently forced on — every module is now user-toggleable from the workspace's module manager. The *only* thing that blocks disabling a module is a genuine dependency (another **enabled** module that depends on it); the artificial "foundation modules are always included" rule is gone. New workspaces still start with those four enabled as a sensible default (now removable). The deeper questions this opens — loosening the hard `dependsOn` chain so any combination of modules can interoperate (via the event bus / eventual QuickFlow editor), per-business-type starting recipes, and what's free vs. paid — are captured as a deliberate future pass in the backlog, not decided here.

### Added

- **Idempotency now covers every create path — step 6 Phase A is complete.** The final six modules are guarded: fulfillment, shipping, inventory, projects (projects *and* tasks), time tracking, and the product catalog (items and variants). All fourteen create paths across the workspace now use the same claim → work → commit-or-release bracket, so a double-fire, a retry, or two tabs submitting at once produce exactly one record — and a create that *fails* still lets the corrected retry through. Catalog items and variants share the upsert shape used by orders, so only their create branch claims a key; updates are naturally idempotent. Projects and Time Tracking share one form wrapper across their create *and* status/timer forms, so the key is opt-in there rather than sent on every submit. No database migration is required.
- **Idempotency extended to files and contracts.** The `claimIdempotencyKey` backstop now guards folder creation, document upload, and agreement creation. **Upload is the one that matters most:** every other guarded create only risks a duplicate row, but a double-fired upload stores the bytes twice *and* meters the organization's storage allowance twice — the only case in this pass that costs real infrastructure money. Its key is claimed after the file check, so choosing no file doesn't burn it, and released if storage or verification fails so the retry actually uploads. Files' two create forms share one wrapper component, so both are covered by a single per-submit key; the contract editor sends its key only on the create branch, since an update is naturally idempotent. **`sendContractAction` deliberately gets no key** — the module's state machine already rejects a second send (`CONTRACT_NOT_SENDABLE`), and a duplicate no-op would return success while dropping the one-time signing links the caller needs. No database migration is required.
- **Server-side mutation idempotency (step 6 — reliability).** New shared mechanism so a mutation can't create a duplicate from a retry, a race, or two tabs submitting the same form: the client sends a per-intent idempotency key, and the server atomically claims it (`claimIdempotencyKey` → `INSERT … ON CONFLICT DO NOTHING` on a new `mutation_idempotency` table, migration `0036`) — only the request that wins the insert does the work, the rest are safe no-ops. This is the server-side backstop beneath the existing client-side pending-disable guards. Wired into the **Client Records**, **Payments**, **Orders**, **Invoicing**, **Quotes & Estimates**, and **Bookings** create paths — payments especially, since a duplicate payment would mis-count money against an invoice. Create forms send a per-submit key (regenerated on success); upsert dialogs send it only on the create branch, since updates are naturally idempotent. The same helper templates to the remaining modules' creates. Race-safety is covered by a concurrent-claims test. Migration applied to the production database.
- **Search & command — the last shared-infrastructure piece (step 5).** `@quickengine/search` gains a real Algolia provider (`createAlgoliaSearchProvider`) and a `getSearchProvider()` env selector — Algolia when `ALGOLIA_APP_ID` + `ALGOLIA_ADMIN_KEY` are set, a no-op provider otherwise (dev/tests offline). An indexer registered in QuickDash's instrumentation subscribes to the domain-event bus and keeps the search index in sync with committed record events (Client Records first — created/updated index the record's current content, deleted removes it), tagging each doc with its `workspaceId`. A workspace-scoped **search proxy** applies the `workspaceId` filter **server-side from a verified membership check** (never a client-supplied filter) — the multi-tenant security gate. And a **⌘K command palette** in every QuickDash workspace searches that proxy and jumps to matching records. No database migration is required.
- **Billing — a dedicated, standalone billing section with a fully custom Stripe checkout.** A new shell-free `/billing/*` area (its own minimal layout, **outside** the dashboard and separate from the marketing site) with three dedicated pages: **`/billing/plans`** (every tier with its **live Stripe price** — never hardcoded — current plan highlighted, monthly/yearly toggle), **`/billing/checkout`** (**our own UI** with Stripe's **Payment Element** — only the secure card fields are Stripe's, everything else is ours; themed to the app, "Secured by Stripe" footnote), and **`/billing/success`**. Choosing a paid tier creates an org-scoped subscription (`default_incomplete`) and confirms it via `stripe.confirmPayment` in our form; the success page reconciles the subscription immediately (idempotent — same path as the webhook) so the plan is live at once, even in local dev without the Stripe CLI. Org-scoped throughout (active org billed, seats = member count, `billing.manage` required). The header **Upgrade** pill now shows **only on the Free tier**, and the org switcher's **tier tag** + the settings **Billing** tab reflect the **real** current plan. `getPlanPricing()` sources amounts from Stripe; `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` added for Stripe.js. No database migration is required.
- **Notifications — in-app inbox + email (step 5).** A new `notifications` table (migration `0035`, additive) backs a per-user, cross-workspace inbox, with a `notify()` seam (new `@quickengine/notifications` package) that writes the durable in-app row and, when relevant, sends an email through the existing provider — best-effort, so a delivery failure never fails the triggering action. The Account header gains a **bell with an unread badge and a popover inbox** (mark-one / mark-all read, deep-link on click). First triggers are **membership**: sending an invite now **emails the invitee their join link** (previously it emailed no one — the inviter only saw a copyable link), and accepting an invite **notifies the inviter** in-app. Built behind a small seam so future triggers (assignments, payments, security events) plug in without rework. Migration applied to the production database.
- **Audit + activity history — the event stream is now persisted (step 5).** A new `workspace_activity` table (migration `0034`, additive) durably records every committed domain event, workspace-scoped: a monotonic `seq` (total ordering — the stream sequence deferred from the QuickEvents versioning decision), the event id (unique → idempotent writes), name, record id, actor, and timestamp. Tiny rows, no sensitive payload, mirroring the event envelope. An in-process consumer registered in QuickDash admin's instrumentation subscribes to the same bus the module writes emit on and persists each event (`recordActivity`, idempotent on event id so a future durable backstop can't double-write). The QuickDash workspace overview now shows a **Recent activity** feed reading it (`listWorkspaceActivity`). This is the workspace/business feed; the Account security-event feed (login history, new-device alerts) remains a separate, still-stubbed axis. Migration applied to the production database.
- **Pusher realtime wired — live updates end to end (step 5).** `@quickengine/realtime` gains a real server Pusher adapter (`createPusherRealtimeProvider`) and a `getRealtimeProvider()` env selector — Pusher when the `PUSHER_*` keys are set, the no-op provider otherwise, so local dev and tests stay offline. The domain-event bus now publishes each committed event to its private per-workspace channel through it. A new `/api/pusher/auth` endpoint (QuickDash admin) authorizes channel subscriptions **only for members of that workspace** — the security gate that stops anyone listening to another workspace's stream. A browser hook (`@quickengine/realtime/client` → `useWorkspaceRealtime`) subscribes and refetches authoritative state on each event, and the **Client Records list is wired as the first live consumer**: a create/update/delete in one session now refreshes it in another. The channel format moved into `@quickengine/realtime` as the single source of truth shared by the publisher and the authorizer, and `NEXT_PUBLIC_PUSHER_KEY`/`NEXT_PUBLIC_PUSHER_CLUSTER` are now declared in the client env schema. No database migration is required.
- **Inngest durable jobs wired (step 5).** `@quickengine/jobs` gains a real Inngest client and `createInngestJobQueue()`, which maps the provider-neutral `enqueue()` onto Inngest event sends (job name → event, idempotency key → Inngest's event id for dedup). A new `getJobQueue()` selector picks Inngest when `INNGEST_EVENT_KEY` is configured and the offline in-memory queue otherwise, so local dev and the whole test suite stay offline — provider selection now lives in exactly one place. The domain-event bus's durable dispatch flows through it, unchanged for producers. A serve endpoint at `/api/inngest` (QuickDash admin) registers a durable `event.dispatch` function that consumes committed domain events — minimal for now (it acknowledges receipt, proving the pipeline is durable end to end), ready for audit/search/notification routing to hang off it in later branches. No database migration is required.
- **Domain-event backbone (QuickEvents) — the spine of shared operating infrastructure.** New `@quickengine/events` package: module writes now publish a small post-commit domain event (`{ id, workspaceId, name, recordId, actorId?, occurredAt }` — identity and provenance only, never customer/payment data; consumers refetch authoritative state). The event bus fans each event out three ways — in-process subscribers, a realtime publish on the private per-workspace channel, and one durable dispatch job keyed on the event id for idempotency — with every side-effect isolated so a realtime or job hiccup can never fail an already-committed write. Providers are the existing no-op realtime + in-memory queue for now; Pusher and Inngest swap in behind them without touching any producer. **Client Records** is wired as the first producer (create / update / deleted events, with the acting user threaded through as the actor). This is the foundation the upcoming realtime, durable jobs, audit/activity history, notifications, and search-indexing work all consume. No database migration is required.
- **Account — products & integrations (honest ecosystem shell).** Replaced the placeholder integrations grid (which falsely showed Stripe/Resend as "Connected" and offered fake "Connect" buttons for platform providers) with a truthful surface: QuickDash listed as **Available** with a working "Open QuickDash" link, QuickFlow and QuickTools named as **Coming soon**, and an integrations section that states plainly that external connections arrive with the public API/OIDC work. Nav item renamed **Integrations → Products**. No database migration is required.
- **Account — usage & storage page (real metering).** Replaced the stub Usage page with a real one that reads the metering engine for the active organization: storage, seats, workspaces, and actions-this-period, each shown as usage against the plan's allowance with a progress bar that colors amber as it nears the limit and rose when over. Org-scoped, consistent with billing; unlimited allowances are labeled rather than barred. No database migration is required.
- **Account — active sessions management.** Added an active-sessions section to Settings → Security (alongside the existing passkey + two-factor management): it lists the devices signed in to your account (browser/OS, IP address, last active, with the current device marked), lets you revoke any other session individually, and offers a "sign out all other sessions" action. Uses the auth client's session methods against the auth app (the single identity authority). No database migration is required.
- **Files storage metering scoped to the organization.** Completes the org-scoped billing migration: the Files module now meters storage usage — and enforces the storage allowance — against the workspace's **organization** instead of the owner user. `syncOrgFileStorageUsage` and the upload allowance check key on the org, summing storage across all the org's workspaces; a legacy workspace with no organization is a no-op. Storage usage is now consistent with the org-scoped plan/subscription. No database migration is required.
- **Billing re-scoped to the organization (money migration).** Fixed a development drift where billing + metering were keyed to the *user*: a subscription now belongs to the **organization** (`user joins → creates org → the org pays → pays for seats`). Migration `0033` (live on Neon) makes `quickengine_subscriptions.organization_id` `NOT NULL` + `UNIQUE` (one subscription per org) and `user_id` nullable. The billing engine (`findOrCreateStripeCustomer`, `upsertSubscriptionFromStripe`, `createCheckoutSession`, `getSubscriptionForOrg`) and the metering plan-lookup (`getAccountPlanId`) all key on the organization; `createCheckoutSession` now bills **seats = the org's member count**; the web Stripe checkout route takes an `organizationId` and requires `billing.manage` on it; the subscription route reads a given org. `getAccountPlanId` also gained a UUID guard so a non-org scope resolves to Free instead of crashing on an invalid-uuid comparison. The full billing test suite (39 tests) was re-scoped to organizations and passes. Follow-up: the Files module still scopes storage metering by owner — aligning it to the org is the remaining piece.
- **Account — billing page (organization-scoped).** Established that billing is **org-scoped**: the plan and seats bill to the active organization (a personal org is an individual's billing entity; a shared org is a team's) — the confirmed model is `user joins → creates org → the org pays → pays for seats → more people join`. Added `getSubscriptionForOrg` to `@quickengine/billing` and replaced the stub billing page with a real one that reads the active org's current plan and shows the tier cards (placeholder prices, finalized in Stripe later). This also surfaced and documented a drift: the billing + metering **write path** was built *user*-scoped (`scopeId = userId`, `getSubscriptionForUser`, checkout keyed on the user), which blocks seats/teams — the migration to org-scope (checkout, webhooks, metering scope, seat quantity) is the focused next step. No database migration is required.
- **Account — cross-workspace Overview (real data).** Replaced the placeholder Overview (which showed invented revenue and empty "coming soon" charts) with honest aggregates across the active organization's workspaces: active workspace count, org members, pending invites, and total modules enabled, plus a real list of the org's workspaces (business type, module count, archived state) that links to each. Money and usage roll-ups and an activity feed are deliberately deferred to the billing, usage, and audit-log slices rather than faked. No database migration is required.
- **Account — workspaces scoped to the active organization.** Closes the organization loop. The account home now lists only the workspaces in your active organization (with a fallback that keeps any legacy null-org workspaces you own visible on your personal org), and creating a workspace now targets the active organization — gated so only an owner or admin (holding `workspace.manage`) can provision one in a shared org, while onboarding still creates your first workspace in your personal org. So you can switch to a shared org — e.g. your company — see its workspaces, and spin up new ones in it, fully separate from your personal account. (The workspace *detail* page in Account remains owner-scoped for now; a shared-org member operates such a workspace in QuickDash, whose access is already membership-based — closing that Account gap is a follow-up.) No database migration is required.
- **Account — organizations: create + switch.** The account app is now multi-organization. A new org data layer (`createOrganization`, `listOrganizationsForUser`) plus an active-organization concept (a membership-validated cookie that falls back to your personal org) power a real org switcher in the header: it lists every org you belong to, switches the active one, and offers "Create organization" via a new `/organizations/new` page. Creating a shared org makes you its owner and switches you into it. The **Team** surface (members, invitations, roles) is now scoped to the active organization, so you can stand up a shared org — e.g. your company — invite people, and manage its team separately from your personal account. Workspace listing and creation are not yet org-scoped (still span your personal account) — that's the immediate follow-up. Covered by an integration test for the org data layer. No database migration is required.
- **Teams / RBAC — remove a member.** Owners and admins can now remove a member from the organization on the Account Team page. The org owner can never be removed — enforced in the `removeOrganizationMember` service and hidden in the UI. Removing a member drops their org membership, so they immediately lose access to the org's workspaces via the authorization seam. Authorized by `can(role, "members.manage")` and covered by an integration test (remove a member, owner protected, non-member no-op). This completes the core Teams/RBAC loop — invite, accept, manage by role, and remove. No database migration is required.
- **Teams / RBAC — enforcement + member visibility.** Replaced the last owner-only checks in Account with capability-based authorization, so roles are actually enforced. A new `authorizeWorkspace` helper resolves the caller's org role for a workspace and checks a capability; the management actions now use it — rename/archive require `workspace.manage`, delete requires `workspace.delete` (still owner-only, since only `owner` holds it), module enable/disable requires `modules.manage`, and API-key create/revoke require `apikeys.manage`. So an **admin can now manage a workspace**, not just the owner. Separately, the account home and the QuickDash workspace switcher now list every workspace the user **owns or is an org member of** (previously owner-only), so an invited member actually sees the workspaces they belong to. Added `isNotNull` to the shared db operator exports. Remove-member is the remaining follow-up. No database migration is required.
- **Teams / RBAC — the members experience (invite → accept loop with UI).** Turned the invitation backend into a usable flow. The Account **Team** page is now real: it lists the organization's actual members (name, email, role) and pending invitations, shows a capability-gated **invite form** (email + admin/member role) that produces a one-time accept link shown once for manual sharing, and lets a manager **revoke** a pending invitation. A new **public accept page** (`/join/[token]`) shows what the invitee is joining (organization + role) and — once signed in — lets them accept, which creates their membership through the tested service and immediately grants their role on the org's workspaces via the authorization seam. Invite and revoke are authorized by `can(role, "members.manage")`; the caller's org role is resolved by a new `resolveOrgRole`, and members are read via `listOrganizationMembers`. Email delivery of invites and gating the other management actions (rename/delete/modules) by capability are the next steps. Covered by integration tests for the two new helpers. No database migration is required.
- **Teams / RBAC — organization invitations (backend).** Added the invitation lifecycle that lets a workspace gain non-owner members. A new `quickengine_organization_invitations` table (org-scoped) stores an invitee email, the role to grant, and a one-time accept token as a `sha256` hash only (never the raw token, mirroring the API-key and contracts signer-token pattern). The `@quickengine/db` service creates invitations (returning the raw token once, for the accept link), resolves a token to its still-open invitation, atomically redeems a token (creates the org membership + marks the invitation accepted, and is safe on double-accept), lists non-secret invitation metadata, and revokes pending invitations. Acceptance flows straight into the Slice-1 authorization seam — the invitee immediately resolves to their granted role on the org's workspaces. Authorization over who may invite or revoke is enforced by callers via `can(role, "members.manage")`. Email delivery, the public accept page, and the Account team UI are the next slice; for now the accept link is surfaced for manual sharing, exactly like the contract signing links. Migration `0032` adds the table (additive) and is live on Neon. Covered by 6 integration tests (create→accept→membership, double-accept, expiry, unknown token, revoke, listing).
- **Teams / RBAC — capability-based authorization foundation.** Replaced QuickDash's owner-only workspace seam with membership-based access: `requireWorkspaceAccess` now admits any member of the workspace's organization and returns their role (`owner`/`admin`/`member`), backed by a new `resolveWorkspaceRole` resolver (the workspace owner always resolves to `owner`, even on legacy rows). Authorization is now **capability-based**, not role-name based: a shared `@quickengine/auth/rbac` model defines named capabilities (`workspace.manage`, `members.manage`, `apikeys.manage`, `records.write`, …) and a single `can(role, capability)` predicate, so every call site checks a capability rather than `role === "admin"`. That means adding a role later (e.g. `moderator`) or, eventually, custom roles and permissions is additive with **zero call-site changes** — the same capability model the API keys already use. No behavior change today (personal orgs contain only the owner), but the seam now supports teams. Covered by 5 unit tests and 3 integration tests. Foundation for the invitation flow, the members/roles UI, and finer per-workspace permissions. No database migration is required.
- **`quick` CLI — first tier (`@quickengine/cli`).** Introduced the QuickEngine command-line tool as a peer of the Quick.js SDK (`packages/cli`, binary `quick`). Configure a workspace-scoped API key once (`quick config set`, stored owner-only at `~/.quick/config.json`, or via `QUICK_BASE_URL`/`QUICK_WORKSPACE`/`QUICK_KEY` which win over the file), then read product APIs from the terminal. It ships real, non-stubbed commands backed by existing `/api/v1` routes — `quick catalog list`, `quick catalog get <id>`, and `quick doctor` (validates config, key format, and live API connectivity, translating failures like a bad key or disabled module into plain language) — each with `--json` for scripting. The credential category is inferred from the key prefix (`qpk_`/`qsk_`/`qsc_`). Workspace, module, and key *management* commands are intentionally deferred until their management APIs exist, rather than stubbed. Documents the ownership boundary in `internal/product/ARCHITECTURE.md`: the CLI, SDK, and API keys are QuickEngine-owned platform tooling; product APIs are served by the product (QuickDash) and gated by QuickEngine keys.
- **Public v1 API — first write route: traffic events.** Added `POST /api/v1/events`, the first write endpoint, ingesting one privacy-minimal traffic event (a page view) through the existing `recordTrafficEvent` service — visitor/session ids are hashed server-side with a per-workspace salt (raw ids are never stored), the write is idempotent on a client-supplied `eventId`, and it is time-bounded. This refined the publishable-key rule from strictly read-only to **website-safe**: a publishable key may now also perform privacy-minimal telemetry writes (the new `events:write` capability), because a storefront reports its own page views from the browser — but still never business-data mutations (orders, records, money). The `@quickengine/quick` SDK gained a `quick.events.record({ … })` resource (serializing `occurredAt` to ISO), with a round-trip test, and an integration test confirms a publishable key can hold `events:write`. Traffic ingestion is deliberately unmetered (cheap analytics), and public-endpoint rate limiting is a tracked follow-up for launch hardening. No database migration is required.
- **Public v1 API — single catalog item + Quick.js integration docs.** Added `GET /api/v1/catalog/:id`, which returns one active catalog item with its active variants as a stable storefront product-detail shape — draft and archived items (and non-active variants) are never exposed, so a non-active id reads as `not_found` rather than leaking. The `@quickengine/quick` SDK gained `quick.catalog.get(id)` (URL-encoding the id) alongside `list()`, covered by a round-trip test, plus a new package README documenting the honest storefront integration: publishable-key auth, list + detail reads, the credential categories, and `QuickApiError` handling. This closes the reference-frontend step — a publishable-key consumer (e.g. Gemsutopia) can now render both a product list and a product detail page. No database migration is required.
- **API keys — management UI in Account.** Each workspace's detail page now has an **API keys** section for creating, viewing, and revoking its keys. Create a key by name, type (publishable / secret / scoped), capabilities, and optional expiry (never / 30 / 90 / 365 days); the full secret is shown exactly once in a copy box with a clear "you won't see this again" warning, and only its hash is ever stored. The list shows each key's name, type, non-secret prefix, capabilities, status (active / expired / revoked), last-used, created, and expiry, with a two-click inline-confirm revoke that takes effect on the next request. Every action is owner-authorized against the workspace (the same seam as the other workspace settings) and archived workspaces can revoke but not create. This completes the API-key slice: keys are now operator-manageable, not just code-issued.
- **API keys — the auth path (publishable storefront reads).** The v1 API gate now accepts workspace-scoped API keys, not just a signed-in session, so an external storefront can read `GET /api/v1/catalog` with no logged-in user. A new `quickengine_api_keys` table stores only the `sha256` hash of each key (never the raw secret, mirroring the contracts signer-token pattern) plus a non-secret display prefix, a capability allowlist, and optional expiry/revocation. A key service in `@quickengine/auth/api-keys` issues (returning the full secret exactly once), verifies (rejecting unknown, expired, or revoked keys, best-effort last-used), lists non-secret metadata, and revokes. The route gate resolves a key before the session fallback: a secret/scoped key via `Authorization: Bearer`, a publishable key via `QuickEngine-Publishable-Key`, with the two channels kept strictly separate so a secret can never be accepted from the public header; the key's own workspace is the scope, and a declared per-route capability (`catalog:read` to start) must be held — publishable keys are clamped to a read-only capability allowlist. `/api/v1/catalog` declares `catalog:read` and is now reachable by a publishable key. Six integration tests cover issuance, hash-only storage, capability clamping, expiry, workspace-scoped revocation, and listing. Migration `0031` adds the new table (additive) and is live on Neon.
- **Public v1 API — foundation and first read route.** Began QuickDash's public HTTP API with `GET /api/v1/catalog`, which returns a workspace's active catalog as a stable, storefront-safe shape (no internal columns) rather than the raw database record. A shared route layer establishes the whole pattern once: a `Request-Id`-correlated response envelope that matches what the `@quickengine/quick` SDK already parses (resource JSON on success; `{ code, message, details? }` on failure), and a single authorization gate that resolves the target workspace from the `QuickEngine-Workspace` header, authenticates the caller, and reuses the same owner-only workspace/enabled-module seam the module pages use — so the API can never grant more than the UI. This first slice authenticates by the signed-in session; publishable and scoped API keys will plug into the same gate when key issuance lands. The SDK gained its first typed resource, `quick.catalog.list()`, covered by a round-trip test. Custom header names dropped the deprecated `X-` prefix (`QuickEngine-Workspace`, `QuickEngine-Publishable-Key`, `Request-Id`) while the SDK is still unpublished and has no consumers. No database migration is required.
- **Operational QuickDash Reporting & Analytics — the final first-wave module page.** Replaced the module placeholder with a read-only, module-aware dashboard. It reports client growth; currency-separated invoicing (issued, paid, collected, outstanding), payments (collected/refunded), and orders totals; a collected-revenue series; fulfillment backlog and overdue work; active/completed projects; scheduled/completed/no-show bookings; contracts awaiting signature; low-stock inventory; and privacy-minimal website traffic — and it honestly marks any disabled module as unavailable rather than inventing zeros. The date range and day/week/month granularity are switchable through URL query parameters (server-rendered, no client state), money stays in integer cents and currencies are never combined, and times respect the workspace's configured IANA time zone. The `[workspace]/[module]` shell now threads `searchParams` to module pages. No database migration is required. **All 15 first-wave operational module pages are now complete.**
- **Public contract signing route.** Added `/sign/[token]` to QuickDash — an unauthenticated, token-scoped page a signer opens from their one-time link. It shows the agreement (title, number, preparing client, document name and SHA-256 checksum, dates, description) and the consent text, then lets the signer type their full legal name, accept the consent, and sign or decline. Signing captures the typed name, consent text/version, and request user-agent/IP as evidence through the module's existing signing service; the token is the only credential, and invalid, expired, or already-used links show a neutral message without leaking workspace data. Live in-page document download for signers (Files access is currently workspace-authorized) remains a follow-up. This completes the Contracts & E-sign loop begun with the operator page. No database migration is required.
- **Operational QuickDash Contracts & E-sign (operator page).** Replaced the module placeholder with a workspace-scoped desk for preparing and tracking agreements. Operators can search and filter by status; create and edit drafts from a specific available Files document version, a client, effective/end dates, and one to ten named signers (name, email, optional role); send a draft, which freezes it and issues one-time signing links that are surfaced for manual sharing (no email delivery is built yet); and track each signer's status, review the append-only audit history, and void, mark expired, or supersede with a numbered revision. Every mutation reauthorizes workspace ownership and enabled-module state, while the existing module service stays authoritative for client and document-version snapshots, durable numbering, signer-token issuance, lifecycle rules, and evidence capture. The public signer-facing signing route is a separate follow-up. No database migration is required.
- **Operational QuickDash Quotes & Estimates.** Replaced the module placeholder with a workspace-scoped desk for preparing quotes, estimates, and proposals. Operators can search and filter by type and status; create and edit multi-line drafts for a client with per-line names, optional descriptions, fractional quantities, unit prices, tax, a valid-until date, notes, and terms; mark a draft as sent to lock it as client-facing history (no email delivery is claimed); record a named acceptance that is explicitly not a legal e-signature; decline, mark expired only after the valid-until date, void, or supersede with a numbered revision; and convert an accepted document into a draft invoice or, when it carries no tax, a draft order. Every mutation reauthorizes workspace ownership and enabled-module state, while the existing module service stays authoritative for client and catalog snapshots, deterministic integer-cent totals, durable per-workspace numbering, lifecycle rules, and exactly-once conversion. No database migration is required.

- **Enterprise-readiness direction.** Reconciled identity and authorization hierarchy, tenant isolation, first-class audit evidence, API and governed-agent security, observability and recovery objectives, restore and incident drills, vulnerability management, staged compliance, platform-aware native design, and shared UI/API/SDK service contracts while keeping security in the control plane, mobile technology open pending a prototype, and formal enterprise claims dependent on real evidence.

- **Guided orientation direction.** Defined a future shared, skippable coach-mark tour and getting-started checklist that teaches QuickEngine Account and QuickDash as distinct surfaces, supports contextual first-visit module guidance, persists versioned progress across devices, meets accessibility and privacy requirements, and leads each workspace recipe to a real first business outcome in under five minutes without blocking normal use.

- **Documentation continuity standard.** Established that durable product, architecture, roadmap, provider, deployment, authentication, security, billing, operational, deferred-scope, and non-goal decisions are reconciled into their canonical documentation as they are made—even when no code changes—without preserving transcripts, conversational noise, or credentials.

- **Provider governance and continuity planning.** Defined a company-owned service-account lifecycle covering least-privilege credentials, environment isolation, multifactor recovery, billing and usage alerts, safe verification, rotation, subprocessor review, and recurring access/cost audits across current infrastructure and future realtime, jobs, search, communications, model, payment, native, and integration providers.

- **Current repository and deployment map.** Reconciled the public architecture documentation with the implemented QuickEngine Web, Auth, Account, and multitenant QuickDash applications; the complete first-wave module catalog; Quick.js and shared bounded-execution foundations; current local commands; and the distinction between applications, modules, recipes, shared packages, and future services. Added the production QuickDash deployment checklist and cross-application URL requirements while keeping unprovisioned realtime, jobs, and search providers explicitly optional until their features are wired.

- **Operational QuickDash Files & Documents.** Replaced the module placeholder with a workspace-scoped private file desk for creating nested folders, uploading described/tagged documents into a folder, browsing active/archived/trashed records, downloading the current available version through short-lived authorized access, and archiving, trashing, or restoring documents. Uploads use the existing verified storage boundary: the server reauthorizes workspace/module access, computes SHA-256, reserves immutable metadata, writes privately through the configured Vercel Blob or local provider, verifies provider-attested identity/size/checksum, and synchronizes account storage usage. Durable public object URLs are never exposed. The initial UI uses server-mediated uploads; large direct multipart uploads, new-version upload UI, attachments, delayed purge jobs, and richer folder navigation remain later operational expansions over existing contracts. No database migration is required.
- **Operational QuickDash Time Tracking.** Replaced the module placeholder with a workspace-scoped time ledger for starting/stopping live timers, recording manual project/task time, preserving descriptions and work dates, distinguishing billable from non-billable work, recording optional hourly rates, and approving or voiding draft entries. The interface explicitly separates tracked/approved time from invoice creation. Every mutation reauthorizes workspace ownership and module enablement; the existing service remains authoritative for tenant-safe project/task references, closed-project restrictions, tracker overlap and single-running-timer protection, bounded durations/rates, timezone-derived timer dates, billing rounding, and legal lifecycle transitions. No database migration is required.
- **Operational QuickDash Projects & Tasks.** Replaced the module placeholder with a workspace-scoped work desk for creating client-linked or internal projects, retaining descriptions and calendar dates, moving projects through their existing lifecycle, and creating task or deliverable records with priorities, due dates, and operational states. Every mutation reauthorizes workspace ownership and module enablement; the existing service remains authoritative for tenant-safe client snapshots, project/task references, closed and archived project restrictions, date validation, legal transitions, and concurrent lifecycle changes. The underlying milestone and subtask contracts remain available for a later interface expansion rather than being falsely represented by this first page. No database migration is required.
- **Operational QuickDash Bookings.** Replaced the Bookings placeholder with a workspace-scoped appointment desk for searching/filtering bookings, scheduling clients with explicit start/end instants, IANA timezone, independent schedule key, location type/details, and notes, and progressing work through requested, confirmed, checked-in, completed, cancelled, or no-show outcomes. Browser-local date/time choices are converted to absolute instants before submission while the booking's named timezone is retained. Every mutation reauthorizes workspace ownership and module enablement; the existing service validates tenant-safe client/catalog references, serializes creation against the workspace, prevents overlaps within the same schedule, locks concurrent lifecycle changes, preserves client snapshots, and restricts permanent deletion to requested/cancelled records. The page does not claim to send reminders, synchronize external calendars, or expose client self-booking. Reads are now deterministic. No database migration is required.
- **Operational QuickDash Shipping.** Replaced the Shipping placeholder with a workspace-scoped shipment desk backed by the existing split-delivery model. Operators can search and filter shipment history, allocate the remaining quantity of physical or rental order lines from confirmed/processing orders, snapshot an international destination, record parcel weight and optional dimensions, maintain provider-neutral carrier/service/tracking details, and move deliveries through draft, ready, shipped, in-transit, delivered, exception, and cancellation states. The page makes the boundary explicit: it records shipment operations but does not pretend to buy labels or call a carrier. Every mutation reauthorizes workspace ownership and module enablement; the server remains authoritative for order readiness, shippable line types, concurrent over-allocation prevention, tracking requirements, terminal locks, legal transitions, and draft/cancelled-only deletion. Each shipment continues to own and synchronize a universal Fulfillment record. Shipment reads are now deterministically newest-first. No database migration is required.
- **Operational QuickDash Inventory.** Replaced the Inventory placeholder with workspace-scoped stock management for base catalog products or concrete variants. Operators can search/filter stock, create one inventory record per target, configure low-stock thresholds, archive/restore safe records, and record append-only receiving, sales, returns, damage, corrections, reservations, releases, and reserved fulfillment movements. The page distinguishes on-hand, reserved, and available quantities and exposes the resulting balance ledger instead of presenting a mutable stock number without history. Every action reauthorizes workspace ownership and module enablement; row locks protect concurrent balance changes, configured negative-stock policy is enforced, reserved stock blocks archival, and permanent deletion requires an archived zero balance with no movement history. Migration `0030` replaces catalog cascade deletion with protective foreign keys so deleting a product or variant cannot erase inventory and adjustment history; it is live on Neon.
- **Operational QuickDash Orders.** Replaced the Orders placeholder with a workspace-scoped order desk for searching/filtering order history, creating and editing multi-line drafts from active catalog items, concrete variants, or custom lines, and moving orders through placed, confirmed, processing, fulfilled, or cancelled outcomes. Client identity plus item names, types, SKUs, variant options, quantities, and integer-cent prices remain historical snapshots. Every mutation reauthorizes workspace ownership and module enablement; active catalog references are revalidated server-side. Confirming creates exactly one universal Fulfillment record, order completion now requires that delivery to be completed first, and cancelling an order atomically cancels its still-active fulfillment so the two modules cannot silently disagree. Only drafts can be permanently deleted, reads are deterministic, and database tests cover totals, tenant isolation, cross-workspace references, edit/delete locks, idempotent fulfillment creation, completion gating, and cancellation synchronization. No database migration is required.
- **Operational QuickDash Products & Services.** Replaced the catalog placeholder with a workspace-scoped interface for searching and filtering offerings; creating and editing physical products, digital goods, services, packages, and rentals; choosing fixed, starting-at, hourly, custom-quote, or free pricing; and managing draft, active, archived, restored, and guarded permanent-deletion lifecycles. Concrete variants support multiple named options, independent SKUs, optional price overrides, and their own lifecycle. Every mutation reauthorizes workspace ownership and module enablement. Catalog and variant reads are deterministically ordered, database tests cover tenant isolation and cross-table SKU conflicts, variants cannot activate before their parent, and archiving a parent now atomically archives its variants. No database migration is required.
- **Operational QuickDash Fulfillment.** Replaced the fourth universal module placeholder with a workspace-scoped delivery queue for searching/filtering fulfillment work, creating records from paid invoices or standalone client work, and moving pending work through start, complete, fail, or cancel outcomes. Physical, digital, service, pickup, and custom delivery types share one honest contract: QuickDash tracks what must happen and never claims that creating or completing a record itself shipped a parcel, sent a file, performed a service, or handed over an order. Client and invoice identity is snapshotted; paid-invoice eligibility, tenant-scoped references, bounded instructions/metadata, immutable terminal history, pending-only deletion, optimistic lifecycle concurrency, and unique module-source identities protect the shared service. Order and Shipping integrations now use the workspace-scoped lifecycle boundary. Migration `0029` adds snapshots, source identity, instructions, failure/cancellation timestamps, and duplicate-source protection and is live on Neon.
- **Operational QuickDash Payments.** Replaced the Payments placeholder with a workspace-scoped payment ledger for searching and filtering payment history, reviewing invoice/client/method/reference details, recording completed offline payments, and recording partial or full refunds. Invoice balances now reconcile from the net sum of successful payments minus append-only refunds, so partial payments remain outstanding, complete coverage marks an invoice paid, and a refund can truthfully reopen it. Disputed funds do not count toward settlement until resolved. Every action reauthorizes workspace access and the enabled module; client and invoice sources are tenant-scoped, recipient identity is snapshotted, exact-money input is bounded, connected-provider identifiers are uniquely constrained against duplicates, and provider payments cannot be falsely refunded only inside QuickDash. Migration `0028` adds provider-neutral payment metadata, recipient snapshots, and refund history, safely backfills legacy Stripe IDs/refunds, and is live on Neon. Live payment collection and provider onboarding remain deliberately outside this first operational interface.

### Fixed

- **Non-UUID paths on QuickDash no longer crash the workspace route.** A request such as `/logo.svg` fell through to the `[workspace]` route, which fed the segment into a UUID-typed query and threw a Postgres `invalid input syntax for type uuid` error. `requireWorkspaceAccess` now rejects any non-UUID workspace id up front and renders `notFound()` instead of crashing the request.
- **Production workspace links no longer fall back to localhost.** QuickEngine Account now uses the canonical `https://dash.quickengine.xyz` origin when a production build is missing `NEXT_PUBLIC_QUICKDASH_ADMIN_URL`, while retaining `http://localhost:3011` for local development. This prevents a live workspace link from leaving the shared cookie domain and incorrectly forcing a fresh QuickDash sign-in. The environment variable remains the explicit deployment configuration and must still be added to sibling projects.

- **Partial-payment entry and balances are now explicit.** Selecting an invoice clears the payment amount, displays the remaining balance only as guidance, and requires the operator to enter what was actually received. Changing or closing the form clears the amount again; the existing server-side balance guard still rejects overpayment. The Payments page now also keeps every open invoice's total, net collected amount, and remaining balance visible outside the entry dialog, so partial-payment state is not hidden behind another action.
- **Operational QuickDash Invoicing.** Replaced the Invoicing placeholder with a real workspace-scoped workflow for searching and filtering invoices, creating multi-line drafts, editing and deleting safe drafts, issuing invoices, reviewing totals and recipient snapshots, surfacing overdue state, and voiding issued invoices. The interface deliberately says **Issue**, not **Send**, because email delivery is not built, and paid status remains controlled by payment reconciliation rather than a manual button. Authenticated server actions reauthorize the active workspace and enabled module on every mutation. The shared module now validates bounded exact-money inputs, uses concurrency-safe invoice numbers, captures client identity snapshots, scopes every operation by workspace, locks issued history, and refuses to rewrite or delete module-managed lines. Dedicated database tests cover totals, numbering, tenant isolation, lifecycle rules, invalid input, and cross-workspace clients. Migration `0027` adds and safely backfills nullable invoice recipient snapshots and is live on Neon.
- **First operational QuickDash module: Client Records.** Replaced the Client Records placeholder with a workspace-configured client directory that lists and searches real records, presents honest empty/no-match states, and supports create, edit, contact links, and guarded permanent deletion through authenticated server actions. Workspace-specific customer/client labels and field visibility come from the module registry. The older module service was hardened at the same boundary: every read, update, and delete now requires the workspace ID; create/update inputs are normalized and bounded; custom fields are capped; list ordering is deterministic; and deletion returns whether the workspace-scoped record actually existed. Dedicated database tests prove cross-workspace IDs cannot read, overwrite, or delete another workspace's client. No database migration was required.
- **Business OS foundation map.** Documented the purpose, trust boundary, dependencies, current status, and intended sequence for QuickActions, QuickEvents, QuickGraph, QuickTimeline, QuickContext, QuickInbox, QuickCommand, QuickConnect, QuickSync, and QuickSim. They remain shared architectural directions—not ten new apps or an interruption to functional QuickDash work. Client Records begins the first practical workspace-scoped action seam; broader abstractions wait for repeated, real module contracts.
- **Quick.js SDK foundation.** Reworked the dormant SDK placeholder into `@quickengine/quick`, a tested TypeScript client foundation for connecting custom frontends and trusted servers to future QuickDash APIs. The client requires an explicit workspace, confines calls to one configured HTTP(S) origin and API version, protects authorization/workspace headers from caller overrides, supports JSON bodies and idempotency keys, preserves request IDs, and returns structured API errors. Separate browser and server factories make credential intent explicit: browser code accepts only session or publishable credentials, while trusted server code accepts secret or narrowly scoped bearer credentials. The marketing example now matches the actual exports. Typed module clients, API-key issuance, REST routes, pagination, retries, webhooks, realtime, uploads, and package publication remain intentionally unimplemented until their server contracts are real.
- **Ecosystem agent harness foundation.** Added provider-neutral shared packages for agent contracts, bounded execution, provider adapters, and QuickDash tools. Runs carry explicit actor, organization, product, and workspace grants; enforce step, token, cost, and duration budgets; validate model-requested tool input and tool output; reauthorize every workspace operation; stop on cancellation; pause sensitive external, financial, destructive, permission, and publishing actions for human approval; and emit structured audit events. A deterministic fake provider makes the reasoning/tool loop testable without paid API calls. The first real QuickDash tools are read-only workspace and enabled-module discovery backed by an injected repository plus a production database adapter; models receive neither database access nor unrestricted code execution. Provider credentials, persistence, paid provider adapters, approval resumption, and user-facing surfaces remain intentionally unimplemented.
- Added a `pnpm user` local-development command for the QuickEngine Account app, paired with `pnpm dash` for QuickDash; the explicit `pnpm account` alias remains available.
- **QuickDash multitenant shell.** Added the first authenticated QuickDash application at `apps/quickdash/admin`, with immutable workspace-ID routes, owner-scoped access enforcement, archived-workspace rejection, workspace switching, and navigation generated exclusively from each workspace's enabled module registry rows. The overview exposes the configured module set and every enabled module has an honest connected route ready for its operational UI; disabled and foreign-workspace routes return unavailable. QuickEngine workspace cards now separate opening QuickDash from managing workspace configuration, while QuickDash links account and workspace administration back to QuickEngine. The shared auth authority trusts QuickDash and the guarded post-login destination allowlist accepts its origin. No database migration was required.
- **Reporting & Analytics module foundation.** Added an unmetered shared reporting module that reads each workspace's enabled-module configuration and returns honest availability alongside real business health: client growth, currency-separated invoices and collected/refunded payments, order value, fulfillment backlog and overdue work, projects, bookings, contracts awaiting signatures, inventory warnings, and privacy-minimal website traffic. Interactive reports use bounded date ranges, validated IANA timezones, and day/week/month chart-ready series; integer-cent totals are returned as lossless strings and currencies are never silently combined. Traffic ingestion is idempotent, rejects stale/future events and query-bearing paths, stores only workspace-salted visitor/session hashes, and retains a normalized path plus referrer host rather than raw URLs or identifiers. Payments now persist explicit success, failure, and refund timestamps so revenue charts do not infer business events from record creation time. Reporting is registered in the canonical module manager without forcing unrelated modules to be enabled. Migration `0026` creates traffic persistence and adds nullable payment lifecycle timestamps and is live on Neon.
- **Contracts & E-sign module foundation.** Added a shared, unmetered Contracts module built on Client Records and immutable Files versions. Tenant-safe persistence snapshots the client, exact source-file identity, content type, and SHA-256 checksum; supports one to ten signers; keeps drafts editable while locking agreements after sending; and preserves presented history through numbered revisions rather than rewriting it. Signer invitations use expiring one-time tokens whose hashes alone are stored. Signing requires explicit electronic-signature consent and a typed legal name, records the consent text/version and available request evidence, and advances multi-signer agreements through sent, partially signed, completed, declined, expired, voided, and superseded outcomes under database row locks. An append-only application audit trail records creation, sending, viewing, signing, declining, expiration, voiding, and revision history without claiming universal legal enforceability. Contracts is registered in the canonical module manager, which automatically enables and protects Client Records and Files. Migration `0025` creates contract sequences, agreements, signers, and audit events and is live on Neon.
- **Quotes & Estimates module foundation.** Added an unmetered shared module for client quotes, estimates, and proposals with distinct numbering defaults, exact three-decimal quantities for hours, measurements, weights, and bulk work, and deterministic integer-cent totals without floating-point money math. Tenant-safe persistence supports arbitrary or catalog-linked line snapshots, client identity snapshots, real date-only validity, named client acceptance that does not pretend to be a legal e-signature, an immutable sent lifecycle, explicit decline/expiry/void outcomes, and revision history that supersedes rather than rewrites a document already shown to a client. Accepted documents convert exactly once into an invoice or order in the same transaction, with honest boundaries for fractional order quantities and order tax support. Durable per-workspace counters now prevent invoice, order, and quote numbers from racing or being reused after deletion. Quotes & Estimates is registered in the canonical account module manager with Client Records resolved first. Migration `0024` creates quote persistence and sequence tables, safely backfills existing invoice/order counters, and makes invoice numbers unique within a workspace.
- **Production private file storage connection.** Connected the Files & Documents storage boundary to the private Vercel Blob store with rotating project credential support and a local token fallback. A live verification confirmed private upload, blocked unsigned access, successful short-lived signed download, and immediate object cleanup; credentials remain only in ignored local or managed deployment environments.
- **Files & Documents module foundation.** Added the canonical shared `files` module with tenant-safe persistence for nested folders, versioned documents, immutable stored versions, and attachments to records owned by any module. Uploads reserve a pending version, verify provider-attested object identity, byte size, and SHA-256 integrity before making it available, preserve failed attempts for safe retry, and support quarantine/release without exposing unapproved bytes. Documents can be archived, trashed, restored, and permanently purged through a retry-safe cleanup job that removes private provider objects before database history; workspace and account deletion are blocked while stored documents remain. Attachments follow the latest version or pin an exact one, with pinned history as the safe default and a same-transaction boundary requiring the target-owning module to validate its record. The shared storage package now has a private Vercel Blob adapter that stores only opaque locators and issues short-lived signed download URLs after authorization; durable object URLs never enter module rows. Current available/quarantined bytes are recomputed across the account and synchronized to `storageBytes`, while non-mutating preflight checks avoid billing failed uploads or ordinary file CRUD. Files is registered in the canonical account module manager. Migration `0023` creates folders, documents, versions, and attachments. Direct-client uploads, malware scanning, previews, search, and the QuickDash file UI remain later layers.
- **Time Tracking module foundation.** Added the project-to-invoice bridge with truthful manual duration entries and real live timers. Manual entries store a calendar work date plus elapsed seconds without inventing fake start/end times; timers store a normalized tracker lane, real UTC start, validated IANA display timezone, and derive their local work date and bounded duration when stopped. Tenant-safe persistence validates project/task ownership, snapshots project/task/client identity so later deletion cannot rewrite history, rejects timer overlap, and enforces one running timer per tracker at the database level. Draft entries remain editable; approval snapshots exact or increment-rounded billable seconds and deterministic integer-cent value; unapprove, void, restore, and guarded deletion preserve lifecycle integrity. Approved billable entries now append source-linked lines to a matching client's draft invoice and update invoice totals in the same transaction; currency/client/status checks reject mismatched billing, database uniqueness prevents duplicate charges, and detaching from an editable draft atomically restores entries to approved. The canonical account registry enables Projects & Tasks and Invoicing first and protects both while Time Tracking is enabled. Recording and invoicing time remain unmetered. Migration `0021` creates time-entry persistence; migration `0022` adds reusable invoice-line source identity and duplicate protection. Workspace-member attribution, timesheets, breaks, bulk approval, and payroll remain later layers.
- **Projects & Tasks module foundation.** Added client-linked or internal projects, ordered milestones, and nested tasks that can explicitly represent either ordinary work or client deliverables. Projects support draft, active, on-hold, completed, and cancelled states with practical reopen paths; milestones and tasks can likewise be completed, cancelled, and reopened without erasing history. Date-only start/due fields validate real calendar dates without inventing timezone instants, task estimates use bounded minutes, and priorities default to neutral `normal`. Tenant-safe persistence snapshots linked client identity, keeps every project/milestone/parent reference inside one workspace and project, rejects closed milestones and hierarchy cycles, and serializes mutations through the project row for consistent concurrent behavior. Detail edits cannot bypass lifecycle transitions; project deletion requires closing and archiving first, milestone deletion requires a cancelled empty milestone, and task deletion cannot discard active history or strand subtasks. The canonical account registry enables Client Records first and protects it while Projects & Tasks is enabled. Organizing work remains unmetered. Migration `0020` creates project, milestone, and task persistence. Team assignments remain deliberately deferred until workspace RBAC provides trustworthy membership; task dependencies, recurrence, templates, comments, attachments, and client-portal visibility remain later layers.
- **Bookings & Scheduling module foundation.** Added client appointments for catalog services or unlisted work, with optional concrete variants, normalized schedule lanes, bounded UTC instants plus their IANA display timezone, in-person/virtual/phone/other locations, and a requested → confirmed → checked-in → completed lifecycle with cancellation and no-show outcomes. Tenant-safe persistence snapshots client identity, validates service/rental/package references and variant parentage, and serializes writes per workspace before checking half-open time ranges—allowing back-to-back appointments while preventing concurrent double-booking on the same schedule lane. Requested and confirmed appointments can be rescheduled safely; terminal history is protected; cancellation/no-show releases the lane. Bookings is registered in the canonical account module manager: enabling it resolves Client Records and Products & Services first, while dependency policy protects both until Bookings is disabled. It remains unmetered; availability rules, recurrence, external calendar sync, group sessions, reminders, and payment/deposit policy remain deliberate later layers. Migration `0019` creates booking persistence.
- **Shipping module foundation.** Added split and partial shipping for selected physical/rental order-line quantities across one or more deliveries. Shipments snapshot a normalized international destination address, support parcel weight and optional complete dimensions, carry provider-neutral carrier/service/tracking fields, reject duplicate order lines within a shipment, and follow an explicit draft → ready → shipped → in-transit → delivered lifecycle with exception and cancellation paths. Tenant-safe persistence locks the order during creation and draft edits, validates every line against that order, and totals all non-cancelled allocations so concurrent shipments cannot exceed the quantity ordered. Shipment contents and destination lock after draft while a narrow tracking update remains available until delivery/cancellation. Each shipment owns a distinct universal Fulfillment record created and status-synchronized in the same transaction, enabling true split delivery without relying on the order's legacy single-fulfillment link. Order and Fulfillment deletion cannot silently erase shipment history; draft/cancelled shipments can be deliberately deleted. Shipping is registered in the canonical account module manager: enabling it resolves the complete Orders dependency chain, Orders cannot be disabled while Shipping needs it, and Shipping itself remains safely removable. Recording shipments is unmetered; future carrier rate and label calls stay behind a separate infrastructure integration boundary. Migration `0018` creates shipments, normalized shipment lines, and parcels.
- **Inventory module foundation.** Added stock attached to either a base catalog item or one concrete variant. Inventory distinguishes on-hand stock from reservations, derives available quantity as on-hand minus reserved, supports per-item low-stock thresholds, and records named movements for receiving, sales, customer returns, damage, corrections, reservations, releases, and fulfilling reserved stock. Tenant-safe persistence validates item/variant ownership and parentage, allows only one stock record per concrete target, and applies every movement under a row lock so simultaneous operations cannot silently overwrite balances. The append-only ledger stores deltas and resulting balances; optional workspace-unique idempotency keys make repeated event delivery harmless. Negative available stock is blocked by default, reservations cannot fall below zero, archived records reject movements, and permanent deletion requires archival. Inventory is now part of the canonical module catalog and account workspace manager: enabling it resolves Products & Services first, while dependency policy prevents removing Products & Services until Inventory is disabled. The module remains unmetered and leaves locations, purchasing, shipping, lots/serials, and production materials outside this initial boundary. Migration `0017` creates the stock and adjustment tables.
- **Variant-aware order lines.** Orders can now optionally point at the exact Products & Services variant purchased while retaining the parent catalog item link. Creation and draft edits reject missing variants, cross-workspace references, and variants attached to a different parent. Each line copies the selected option values into its immutable historical snapshot, so deleting or editing the live variant cannot rewrite what the customer ordered. Migration `0016` adds the nullable variant reference, option snapshot, and lookup index; existing orders remain valid unchanged.
- **Product Variants for Products & Services.** Extended the catalog with concrete option combinations such as size/color, material/finish, or format/license without inventing a separate module. Each workspace-scoped variant has a stable order- and case-independent combination identity, optional normalized SKU, optional integer-cent price override (otherwise inheriting its parent offering), metadata, a readable label, and the same draft/active/archived lifecycle as catalog items. Tenant-safe CRUD prevents cross-workspace parent access, rejects duplicate combinations under one offering, requires archival before permanent deletion, and only activates a variant when its parent is active. Workspace locking and validation keep SKUs unique across both base catalog items and variants despite their separate tables; deleting a parent cascades its variants. Stock quantities remain outside this contract so Inventory can track a base item or a specific variant without owning what that variant means. Migration `0015` creates variant persistence.
- **Orders module foundation.** Added the first transactional commerce module with immutable customer and line-item snapshots, integer-cent totals, stable per-workspace order numbers, tenant-safe CRUD, and a deliberate draft → placed → confirmed → processing → fulfilled lifecycle with cancellation before completion. Order creation locks its workspace while allocating the next sequence so simultaneous creates cannot duplicate a number; draft edits atomically replace lines and recompute totals, while later states preserve history. Every order validates its Client Record and catalog references against the same workspace, then snapshots customer name/email plus each purchased item's name, type, optional SKU, quantity, and price so later source edits or deletion cannot rewrite history. Confirmed or processing orders can idempotently hand off to the universal Fulfillment module. The canonical registry and account module manager expose Orders as domain-specific and unmetered: enabling it automatically resolves Products & Services and the universal dependencies, disabling Products & Services is blocked while Orders needs it, and Orders itself remains safely removable. Inventory, shipping, tax, discounts, payment state, and storefront checkout remain separate concerns. Migration `0014` creates orders and normalized order lines.
- **Products & Services module foundation and account module manager.** Added the first optional module beyond the universal foundation with a deliberately broad catalog model for physical products, digital goods, services, packages, and rentals. Its workspace-scoped persistence and tenant-safe CRUD validate every write, keep status changes on an explicit lifecycle, protect active records from permanent deletion, isolate identical record IDs across workspaces, cascade records when their workspace is deleted, and keep nonempty SKUs unique inside each workspace. The contract defines draft/active/archived states; fixed, starting-at, hourly, custom-quote, and free pricing; optional currency, unit labels, descriptions, and metadata; and workspace-level naming/settings. The canonical registry now ships it as shared, dependency-free, and unmetered. Workspace owners can enable or disable it from the account app while all four foundation modules remain visibly locked; archived workspaces must be restored before configuration changes. It intentionally does not absorb inventory, orders, shipping, bookings, files, variants, or tax behavior. Migration `0013` creates the catalog table.
- **Reusable workspace creation and complete account workspace lifecycle.** Onboarding and the account app share one atomic workspace creator with validated inputs, collision-safe slugs, and all four foundation registry rows. The formerly inert New Workspace button opens a real creation screen with preset/custom modes and a searchable 20-type catalog; AI-assisted configuration is shown honestly as not yet connected. Ownership-scoped detail pages show canonical module state and settings. Management actions rename while preserving the stable slug, archive/restore without deleting data, and permanently delete only after the workspace is archived and its exact current name is typed. The list filters Active, Archived, or All; migration `0012` adds the nullable archive timestamp.
- **Complete workspace module-registry management layer.** The registry can now return a workspace's canonical configuration, identify direct and transitive dependents, and reject unknown stored module IDs. Idempotent enablement resolves missing dependencies atomically, seeds canonical defaults, preserves settings on re-enable, and synchronizes the temporary compatibility list. Protected disablement refuses the four permanent foundation modules and modules required by enabled dependents; safe optional modules retain their settings. Validated settings patches merge without losing other values or changing enabled state and lock rows against concurrent lost updates. Recipes can atomically apply a dependency-resolved starting set without removing independent user choices, and an optional policy-neutral availability hook leaves room for future rollout or plan checks without defining tiers or pricing today.
- **Fourth universal module: Fulfillment.** Added the final piece of the free foundation: a workspace can now track delivery of a physical product, digital item, service, or other promised work through a small `pending` → `in_progress` → `fulfilled` lifecycle, with cancellation and optional tenant-safe links to its client, invoice, and payment. Fulfillment depends on Payments, is unmetered, and is now permanently included by onboarding and the canonical registry resolver. Migration `0011` creates the fulfillment records and backfills the fourth registry row for existing workspaces.
- **Canonical module dependency resolution + atomic onboarding configuration.** The registry now resolves module dependencies in dependency-first order, rejects unknown IDs, deduplicates shared dependencies, and stays DB-free for recipes and discovery. New workspaces atomically create registry rows with default settings and the canonical `client-records` → `invoicing` → `payments` foundation; onboarding completion rolls back if configuration fails. The picker shows those three built foundation modules as permanently included and marks Fulfillment and other planned capabilities honestly as coming soon, without inventing pricing gates.
- **Real account workspace list.** The account app's Workspaces home now reads the signed-in account's actual workspace rows instead of permanently rendering a placeholder empty state. Onboarding-created workspaces appear in searchable card and table views with their business type, enabled-module count, and creation date; the QuickDash launch action remains deliberately disabled until the host app exists.
- **Workspace-module registry foundation.** Added the canonical module manifest contract and catalog for Client Records, Invoicing, and Payments, plus the workspace-scoped `workspace_modules` table (migration `0010`) for enabled state and per-module settings. This establishes the persistence layer that will let each workspace carry its own QuickDash configuration; dependency resolution, settings updates, plan gates, and recipes remain the next registry step.
- **Third module: Payments — closing the money loop.** `@quickengine/mod-payments` lets a workspace collect money from its clients via its **own** connected Stripe account (Stripe Connect destination charges — distinct from QuickEngine's house billing). New tables `payment_accounts` (one connected account per workspace) + `payments` (migration `0009`). **It reconciles across modules**: on a payment succeeding, the linked invoice is marked `paid` through the Invoicing module's own API (`dependsOn: ["invoicing"]`) — the first module that *writes through* another. Pure, tested logic for the platform fee (basis-point application fee, floored to whole cents, capped at the amount, **default 0 — you never pay to receive your own money**) and the payment state machine (pending → processing → succeeded → refunded, with terminal failed/refunded). Stripe Connect calls (account onboarding + destination PaymentIntents) are isolated behind an integration boundary, wired live when the host app + keys land. Tenant isolation on invoice references. 17 adversarial tests. Also relaxed the invoice state machine to allow `draft → paid` (a draft settled by a payment link). This is module #3 of the **4 universal modules** every business recipe uses (Client Records → Invoicing → Payments → Fulfillment).
- **Billing principle set + module catalog (`internal/MODULES.md`).** Locked the rule that metering is only for what costs QuickEngine real infrastructure (storage, conversions, AI, email/SMS, automations) — never business outcomes the customer earns. No per-customer fee, **no per-invoice fee**, no tax on their success. Modules are free-forever (with optional free-tier count caps), paid-to-unlock (then unlimited use), or resource-metered. New `internal/MODULES.md` maps the full starter catalog (Client Records, Files, Invoicing, Quotes, Payments, Projects, Time Tracking, Bookings, Products, Orders, Inventory, Automations, and more) and the business-type recipes (freelancer, agency, e-commerce, bookkeeping, coaching, trades). Also **reverted Client Records' metering** to match the principle — it no longer calls `enforce()`; it's free and unmetered like Invoicing.
- **Second module: Invoicing — and the first cross-module dependency.** `@quickengine/mod-invoicing` bills a workspace's clients: `invoices` + `invoice_line_items` tables (migration `0008`, money stored as integer **cents**, never floats), CRUD, a validated status lifecycle (draft → sent → paid, plus void; illegal jumps rejected), and server-computed totals that are never trusted from the client. It **composes on Client Records** — an invoice points at a client record — which introduced a new primitive to the module system: **`dependsOn`** in the manifest, so onboarding can enforce that a module's dependencies are enabled. Tenant isolation is built in: an invoice can only reference a client in its own workspace. Notably, Invoicing declares **`meteredAction: null`** — creating or sending an invoice is a business outcome, not billable infrastructure, so it isn't metered (a deliberate shift: metering is being reserved for actions that cost us real resources, not per-record CRUD). 16 adversarial tests (money math, the state machine, settings, the dependency).
- **The module system + its first module: Client Records.** Modules now live under `packages/modules/<name>/` — each a self-contained package (new `packages/modules/*` workspace glob) that owns its DB schema, a settings schema, and a **manifest** declaring its identity and the one thing it meters as an "action." The first is `@quickengine/mod-client-records`: a shared record of the people and organizations a business deals with (customers, clients, students — a workspace relabels it and toggles which fields show). It adds a workspace-scoped `client_records` table (migration `0007`) and CRUD. It is **free and unmetered** — storing a contact is not a billable action (you don't pay to have customers); the only lever near it is a free-tier count cap at the plan layer. Settings + manifest are covered by tests; the API routes, dashboard UI, and the QuickDash host app that renders it come next.
- **Org / RBAC foundation (the Vercel model).** Introduced organizations as the account/team layer so the schema is right *before* real users, not retrofitted after. Every user gets a **personal org** auto-created on signup (a Better Auth `databaseHooks` after-create → `ensurePersonalOrg`, idempotent), plus a **`organization_members`** table (who's in an org + their role — `owner`/`admin`/`member`, which is what "seats" counts) and an **`organization_id`** on workspaces (workspaces now belong to an org). One login, many orgs, joinable and creatable: a solo user gets an invisible personal org; teams and enterprise get the full hierarchy with no code retrofit. Idempotent personal-org creation is covered by adversarial tests; migration `0006` applied to prod + preview. Workspace-level roles + the scope-switcher UI are the next refinements; metering stays per-account and flips `user`→`org` cheaply (the engine is scope-agnostic) when team billing lands.
- **Idempotent onboarding + workspace slugs.** `completeOnboarding` is now idempotent — if onboarding already finished it won't create a second workspace (fixes the duplicate-workspace-on-re-run/double-submit bug). Each workspace also gets a URL-safe **`slug`** (new column + unique-per-owner index), generated from its name and made unique per account (`acme` → `acme-2` on collision) via pure, unit-tested helpers (`slugify` + `nextAvailableSlug`, 7 adversarial tests behind a new DB-free vitest config on the account app). Display names stay non-unique by design — two businesses can share a name; only the slug is unique.
- **System status indicator.** A shared `StatusIndicator` (in `@quickengine/ui`) that actually pings the app's `/api/health` and shows a live "All systems operational" pill (green/amber dot), linking to the status page. Placed in the **web footer** and the account app's **Settings → Support**.
- **Subtle "Upgrade" button.** A small pill in the account app header, next to the profile menu — shown for every tier below the top one, and it gains an amber/red dot only once a usage meter hits warn/over (reading the new metering engine). Present but never nagging; hidden entirely on the top tier. Links to pricing.
- **Per-page SEO sweep (web).** Every static marketing page (31 of them) plus the dynamic business / docs / module routes now use the shared `buildMetadata()` helper with a **unique meta description and a self-canonical URL** (previously they set only a title and inherited the site description). Descriptions are written per page; the dynamic routes pull theirs from each solution / doc section / module's own copy.
- **Test-DB reset fix.** `truncateAll()` (test harness) now discovers public tables at runtime instead of a hardcoded list, so a newly added table (like `quickengine_usage`) can never be silently skipped and leak state between tests.
- **Usage metering engine.** `@quickengine/billing` now meters usage **per account** (one budget shared across all of a customer's workspaces). Per-plan limits live in `plans.ts` (placeholders, tune freely): **actions** (a counter that refills each billing period) plus **storage / seats / workspaces** (gauges — current totals that don't reset). A new `quickengine_usage` table stores the counts via an atomic upsert, so concurrent writes can't be lost. The engine exposes `meter()`, `checkLimit()` (→ `ok` / `warn` / `over`), `enforce()` (the gate a module calls before doing work), and `getUsage()`. Enforcement is **soft**: warn at 80%, a 10% overage grace, the action that tips an account over still finishes, and anything already in flight always completes — hitting the cap shows an upgrade prompt, it never corrupts in-progress work. Covered by **20 adversarial tests** (limit thresholds, grace ceiling, counter-vs-gauge, atomic concurrency, plan resolution). Design in `internal/METERING_DESIGN.md`. Not yet wired into module actions — that comes as modules get built.
- **Identifier-first sign-in.** The sign-in screen is now email-first: enter your email (or use Google / GitHub / a passkey), hit **Continue**, and *then* it asks for your password — a cleaner, progressive flow that never asks for a password you might not need. It's also the foundation for enterprise SSO: the email step is where an SSO-domain lookup will route a company's users to their own login. Magic link, forgot-password, and the two-factor challenge are all preserved.
- **Delete account (Danger Zone).** Settings → Profile now ends with a **Danger Zone** and a **Delete account** action behind a confirm dialog. It permanently deletes the user and cascades sessions, accounts, workspaces, 2FA, and passkeys (clearing the non-cascading subscription + organization rows first, in one transaction), then signs out and drops you at sign-up. Also adds a **`pnpm db:reset`** dev script (one-command truncate via the repo's Postgres client — no psql, no Neon web editor) for wiping test data.
- **The account-security step is now a real method picker.** Instead of jumping straight to an authenticator, the onboarding "Secure your account" step lets you **choose** how to protect the account from the methods we've built: a **passkey** (Face ID / Touch ID / fingerprint / security key, via WebAuthn), or an **authenticator app** — which now shows an actual **scannable QR code** (rendered from the TOTP URI with `qrcode.react`) alongside the manual key and recovery codes. Add a passkey and it offers to stack an authenticator too. Settings → Security now renders the same QR for its authenticator setup, so the two surfaces match. Passkeys are now bound to the shared parent domain (`quickengine.xyz`) with an origin allowlist, so a passkey created on the account app is valid across all our subdomains (WebAuthn binds credentials to the `rpID`).
- **CORS on the auth API for our own sibling apps.** Browser calls from the account/web apps to the auth API (`auth.quickengine.xyz/api/auth`) were blocked because the route had no preflight (`OPTIONS`) handler and returned no `Access-Control-Allow-Origin` — so anything mutating auth from another subdomain (enabling 2FA from onboarding or Settings, adding a passkey, etc.) silently failed. The route now handles `OPTIONS` and echoes credentialed CORS headers for allowed origins: the explicit app URLs plus any subdomain of the shared cookie domain (`*.quickengine.xyz`), matched by a dependency-free `matchOrigin` helper with adversarial tests (rejects look-alikes like `quickengine.xyz.evil.com` / `notquickengine.xyz`). The onboarding 2FA step was also hardened to surface network errors instead of stalling.
- **Optional 2FA setup during email sign-up.** After verifying their email, a new **email/password** user now lands on an optional "Secure your account" step as the first thing in onboarding: set up an authenticator (TOTP) — confirm password → add the setup key + save recovery codes → enter a 6-digit code — or **skip for now** and do it later in Settings. It's shown **only** for password sign-ups that don't already have 2FA on (OAuth/Google/GitHub users skip it entirely, since they never set a password), gated by a DB check for a `credential` account. Reuses the existing `twoFactor.enable`/`verifyTotp` flow.
- **Renamed the dashboard app → `account`.** The user-facing account panel is now `apps/quickengine/account`, package `@quickengine/account`, with its URL env var renamed to `NEXT_PUBLIC_QUICKENGINE_ACCOUNT_URL` (matching the naming convention: this is the account surface a user logs into, which opens on a Dashboard overview). The post-sign-in redirect target and the auth trusted-origins were updated to the renamed env var; the "Dashboard" overview label inside the app is unchanged. Outward-facing infra (the Vercel project, its env-var key, and the `dashboard.` → `account.quickengine.xyz` domain) is a coordinated Vercel/DNS follow-up.
- **SEO across all three apps.** Marketing site (`apps/quickengine/web`): a shared `buildMetadata()` helper (`app/_lib/seo.ts`) with `metadataBase`, a title template, canonical URLs, Open Graph, and Twitter (`summary_large_image`) cards. Two shared share images — a **1200×630 `og-image.png`** and a **1200×675 `twitter-image.png`** — are set once at the root layout and inherited by every page, so the cards are identical everywhere with **no per-page drift**. Added a **`sitemap.xml`** that auto-discovers static routes by walking the app tree (plus the module / business / docs dynamic routes) so a new page can't be silently left unindexed, a **`robots.txt`**, and **Organization + WebSite JSON-LD** structured data (with the real social profiles as `sameAs`). The **auth and dashboard apps** get the same OG/Twitter cards (referencing the single image files in web, so it's still one source of truth) plus `metadataBase`, but are marked **`noindex`** — login/app surfaces shouldn't compete with or dilute the marketing site in search, while still unfurling with the brand card when a link is shared. Declared `@quickengine/env` as a direct web dependency so the site URL comes from the typed env.
- **Production sign-up now works end to end.** The live Google-OAuth flow was bouncing between `auth.` and `dashboard.` in an infinite login loop because the session cookie was host-only — the cross-subdomain session cookie is now enabled in production (`AUTH_COOKIE_DOMAIN=.quickengine.xyz`). And email verification codes weren't arriving because the sender was hardcoded to `onboarding@resend.dev` (which Resend only delivers to the account owner); the sender is now **env-driven via `EMAIL_FROM`**, so with a Resend-verified domain, codes reach any recipient.
- **Cost guardrails** for deploy environments. Decided + documented (`internal/COST_GUARDRAILS.md`) what database and cache each environment uses — local = docker, CI = ephemeral Postgres, **preview = one shared, persistent Neon branch** (not a branch-per-deploy, which multiplies compute cost), production = prod — with prod credentials scoped to the Production environment only. Typed `VERCEL_ENV` and a `DATABASE_IS_PRODUCTION` flag into the env, and added a guardrail in the DB client that **refuses to boot a non-production Vercel deployment against the production database** — it fails loudly instead of silently reading/writing prod data from a preview.
- **Monitoring basics.** **Sentry** error monitoring is wired into all three apps (web, auth, dashboard): server + edge + client instrumentation, `withSentryConfig` on each `next.config`, an `onRequestError` hook, and `Sentry.captureException` in every app's global-error boundary. It's gated to production and reads its DSN from env (`SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`), with build-time source-map upload via `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` (the `@sentry/cli` install script is approved in the root pnpm config). Also added a **`/api/health`** liveness/readiness route to each app: it probes the database through a shared `checkHealth()` in `@quickengine/db` and returns `{ status, checks }` with `200` (ok) or `503` (degraded). Redis isn't probed yet — no client is wired for it, only env vars are reserved.
- The **QuickEngine marketing front page** is built out into a full, responsive landing experience (structure + UX complete; visual polish is a later pass). Seven sections tell one guided story: a **hero** with a centered **AI prompt** — describe your business and a recommended QuickDash workspace (type + modules + suggested plan) assembles itself below it (mocked with a keyword heuristic for now; wired to swap in a server route that calls a lightweight hosted model, key server-side only); a sticky **scrollytelling showcase** where a scrollspy rail steps through business types (E-commerce · Agencies · Freelancers · SaaS) while a pinned workspace preview morphs to match (self-identification, the highest-signal move right after the hero); a **"why"** beat pairing the pain→promise copy with a **convergence diagram** (scattered capabilities wired into one QuickDash mark); a **how-it-works** beat (spin up a workspace → switch on modules → bring your frontend) with a product-preview window; a **modules** breadth grid (Auth · Billing · Storage · Search · Jobs · Realtime · Analytics · Webhooks · Email) with hairline cell separators; a closing **CTA** using the tagline as a bookend; and a **footer** with the complete sitemap. Chrome + interactions: a **sticky-hero reveal** (the hero pins while the next section slides up over it), a **desktop mega-menu** (full-bleed panels that grow the header downward on hover — no chevrons — with page-scroll locked while open), a shared **Logo** mark, a footer **language selector** + **theme switch** (next-themes wired into web: light/dark/system), and the page gutter set to the header height for symmetric framing. Full **mobile responsiveness**: the header collapses to a logo + hamburger that opens a full-screen **accordion** menu (revealing the same subpages as desktop), page-scroll locks while it's open, and the hero prompt handles the iOS quirks (16px font to stop focus-zoom, and scroll-position restore so tapping the prompt never bumps the page into the overlap).
- Filled out the **entire marketing site** behind the front page — every header mega-menu and footer link now resolves to a real page (no dead links). All reuse the shared header/footer: **Pricing** (tier cards with a working annual/monthly toggle, annual-first, placeholder prices); **Products** (hub + Workspaces, a Modules directory with a page per module, Marketplace); **Developers** (hub + Docs home + API/SDKs/CLI/Quickstarts/Examples, Changelog, Status); **Business** (hub + solution pages for e-commerce, agencies, freelancers, SaaS, enterprise, startups, scale-ups, migrations, plus Partners and a Startup Program); **Resources** (hub + Blog, Guides, Tutorials, Customers, Case studies, Events, Webinars, Support, Community); **Company** (hub + About, Careers, Contact, Brand); and the **Legal** set — **Terms, Privacy, Cookie, and a Refund & Cancellation policy** — rendered as custom pages from the real drafts in `internal/` (a stale "Polar" payment-processor reference corrected to Stripe; the drafts still need legal review before launch). Content is placement-first placeholder ahead of the visual polish pass.
- The account **dashboard shell** is now built out into a real control panel. A fixed header carries a **team/account switcher** (top-left: generated team avatar + tier badge + a searchable team popover), **breadcrumbs**, a **⌘K search** that opens a command-palette modal, and a **profile menu**. A left **sidebar** navigates the umbrella surfaces — Dashboard · Workspaces · Revenue · Analytics · Team · Integrations · Activity — with a dedicated **Settings** footer button (its own header-height footer + divider) that opens a **settings dialog** (its own sidebar: Profile · Security · API keys · Team · Billing · Usage · Appearance · Language · Support). The **Dashboard** is the read-only umbrella view across every workspace: metric cards with big display-font numbers, inline sparklines, and up/down deltas, plus placeholder revenue + activity panels. The **Workspaces** page has a search, filter, cards/table toggle, and a New Workspace type picker. The boundary is deliberate — the dashboard **monitors** (aggregate/read-only); operating a business stays inside a QuickDash workspace.
- **Light / dark / system theming** on the dashboard (next-themes): follows the OS preference, persists across reloads, and **crossfades** between themes instead of flashing. A neutral light palette mirrors the void-black dark theme, and the shell's surfaces are theme-aware (foreground-based, not hardcoded white). Appearance + Language live in the settings dialog (Language ships English + Tagalog as i18n groundwork).
- **Frosted-glass modal backdrops** — dialogs, alert-dialogs, and sheets now blur what's behind them (moderate, reduced-motion aware).
- The account **dashboard** is now a real, session-protected panel instead of a bare white page: the void-black theme + self-hosted brand fonts + mesh background (matching web and auth), a header showing the signed-in email and a working sign-out, and a placeholder Overview. Its tab title now follows the `Page | QuickEngine` convention too.
- Consistent status/error pages across **all three apps** (web, auth, dashboard): a **404**, a segment **error boundary** (500) with retry, a root **global-error** fallback, and a route-level **loading** state — all built from shared `StatusScreen` / `LoadingScreen` / `GlobalErrorScreen` in `@quickengine/ui`, so every app's 404/500/loading looks identical (only the link target differs). No more default Next 404 on web/dashboard.
- QuickEngine web front door (skeleton, pre-polish): a fixed frosted-glass header (logo mark + centered nav — Products / Pricing / Resources / Contact — with a hover-dim interaction and contiguous hit areas, plus Sign in + a Get Started pill), a locked-in responsive `.page-gutter` margin standard, the self-hosted brand fonts (Clash Grotesk display + General Sans body via `next/font/local`, no external CDN flash), and a mesh + grain site background. The header's Sign in / Get Started now link out to the auth app.
- Polished the whole **auth app** — every user-facing screen (sign in, sign up, verify email, reset password) now carries the on-brand UI instead of the old raw forms, matching the marketing site pixel-for-pixel (same fonts, void-black theme, mesh background, and monochrome FontAwesome Google/GitHub marks). All existing methods stay wired: email/password, Google/GitHub, magic link, passkey, forgot-password, and the 2FA challenge + recovery-code step. The auth root redirects straight to sign in (no marketing front page). Reset and verify now have proper new-password (with confirmation) and resend flows.
- **nuqs** for URL-persisted state, wired into all three apps (web, auth, dashboard) so future UI state (pricing toggle, dashboard filters/tabs) can live in shareable, refresh-proof URLs. First use: the auth `?redirect=` target is now read through nuqs — and hardened with an **open-redirect guard** so a crafted `?redirect=https://evil.com` is ignored and only our own app origins are honored.
- Stripe billing backend in `@quickengine/billing`: a single-source plan config (tier names are placeholders; prices are env-driven Stripe price IDs, never hardcoded amounts), Stripe customer management (self-healing — recreates the customer if the stored one no longer exists at Stripe), checkout-session creation, and a webhook that syncs the subscription lifecycle (created/updated/deleted, invoice paid/failed) into `quickengine_subscriptions`. The hand-rolled checkout/webhook routes now call this package via the official Stripe SDK. Added a basic billing dev console (`/dev/billing`) plus checkout success/cancel pages to run sandbox payments, and a money-path test suite (plan mapping, webhook sync, checkout + customer self-heal with Stripe mocked). Also wired the shared dark theme into the web app so its pages render. CI already runs Postgres for these tests. Confirmed end to end against Stripe test mode: checkout → payment → subscription recorded.
- Adversarial unit tests for the **open-redirect guard**. The post-auth `?redirect=` resolver was extracted into a pure, dependency-free core (`_redirect.ts`) and covered with real attack cases — external origins, protocol-relative `//host`, userinfo `…@evil.com`, look-alike subdomains, scheme mismatches, and `javascript:`/`data:` payloads all fall back to the dashboard, while our own app URLs are honored. Runs DB-free via a new minimal vitest config on the auth app (the existing integration suite still owns the DB-backed flows).
- Vitest integration-testing foundation and the auth test suite. Tests run against a dedicated `quickengine_test` database (auto-provisioned from the committed migrations, truncated between tests) so they exercise the real auth wiring rather than mocks. The suite leads with failure paths: unverified accounts get no session, wrong/duplicate credentials, no user enumeration on password reset, 2FA blocking password-only sign-in, single-use recovery codes, bearer tokens working without cookies, and rate limiting. Flows that need a browser (passkey ceremony, OAuth round-trip) are marked pending for a later Playwright layer so the suite stays green. CI now runs Postgres so `pnpm test` executes the suite.
- Bearer-token authentication for native clients (desktop and mobile, both Tauri): the Better Auth bearer plugin exposes the session token in a `set-auth-token` response header and accepts `Authorization: Bearer <token>`, so native apps authenticate without cookies. No schema change. Added a cookie-free bearer test to the dev console.
- Two-factor authentication (TOTP) with recovery codes: a new `quickengine_two_factors` table plus a `two_factor_enabled` flag on users (with its migration), the Better Auth two-factor plugin on the auth server, the two-factor client plugin, and enable / verify / backup-code / disable controls on the dev console. With 2FA on, password sign-in requires a TOTP or recovery code to complete.
- WebAuthn passkey sign-in: a new `quickengine_passkeys` table (with its migration), the Better Auth passkey plugin on the auth server, the passkey client plugin, and register / sign-in / list controls on the dev console.
- `@better-auth/passkey` dependency, ahead of passwordless / passkey sign-in.
- Resend-backed email provider in `@quickengine/email`, with a console fallback that logs mail locally when no API key is set.
- Functional auth dev console (`/dev`) plus `/verify-email` and `/reset-password` pages in the auth app, and client exports for password reset and email verification. Email/password sign-in, email verification, and password reset confirmed working end to end.

### Changed

- **Dogfooding and Backoffice boundary clarified.** QuickEngine will run ordinary company operations through QuickDash wherever customers can, while a future private Backoffice app remains the isolated control plane for platform-owner recovery, subscription exceptions, abuse response, audit review, feature flags, operational visibility, controlled support access, and emergency actions.
- **Future product boundaries clarified.** QuickDash remains the modular business system of record, while the planned QuickFlow product will own automation, workflows, integrations, and AI-driven execution through stable QuickDash events and actions instead of becoming another dashboard module. QuickTools will begin as an in-dashboard utility/widget suite and only graduate into a separate product if usage supports it. The payment roadmap now preserves provider portability and keeps any transaction-priced plan optional rather than imposing a mandatory share of customer revenue.
- Consolidated duplicate env vars to one canonical name per URL: dropped `NEXT_PUBLIC_APP_URL` (same as `NEXT_PUBLIC_QUICKENGINE_WEB_URL`) and `NEXT_PUBLIC_DASHBOARD_URL` (same as `NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL`) from the env schema, the auth trusted-origins list, the checkout route, and `.env.example`. Also removed the now-redundant `.optional()` on the optional server-env fields (the `emptyStringAsUndefined` helper already makes them optional).
- Neutralized the **entire palette to pure grayscale**: the residual blue hue on `--card`, `--popover`, `--secondary`, `--muted`, `--accent`, `--muted-foreground`, `--ring`, and the sidebar tokens is gone (chroma `0`). No blue anywhere in the product now — only `--destructive` red remains. Dark stays the default; light is an opt-in mirror.
- Dropped the aurora-blue accent from the shared theme: `--primary`, `--accent`, and `--ring` are now neutral, so the palette stays fully monochrome void-black until a real accent is chosen.
- Consolidated the shared UI into **`@quickengine/ui`** so apps stop redefining the same look. The void-black theme, mesh + grain background, brand fonts, and the auth shell / status-screen / form-and-button primitives now live once in the package (a `brand.css` layer + a `fonts` export + a component barrel); web, auth, and dashboard import them instead of keeping per-app copies of the theme, fonts, and `Background`. New apps inherit the look for free. Each app keeps only a thin `globals.css` (import the shared base + brand, scan the package) and genuinely app-specific bits (e.g. web's `.page-gutter`).
- Sessions now last **30 days on a sliding window** (refresh-on-use), up from 7. Active users effectively stay signed in; only ~30 days of real inactivity logs them out — a meal break or a long weekend never does.
- Unified the browser identity across all three apps: the same favicon (the web app's mark) now ships in web, auth, and dashboard, and every app uses one tab-title convention — `Page | QuickEngine`. Each page carries its own name (Sign In, Sign Up, Verify Email, Reset Password, Overview, Checkout Complete, …) instead of a single bare app title.
- Dropped hyphens from the auth page routes: `/sign-in` → `/signin`, `/sign-up` → `/signup`, `/verify-email` → `/verify`, `/reset-password` → `/reset`. Better Auth's own API endpoints (`/api/auth/sign-in/…`) are unchanged. All internal links and the password-reset / email-verification callback URLs were updated to match.
- Renamed the `apps/quickengine/admin` app to `apps/quickengine/dashboard` (`@quickengine/dashboard`) — it's the user-facing account panel, not staff tooling. Env vars `NEXT_PUBLIC_ADMIN_URL` → `NEXT_PUBLIC_DASHBOARD_URL` and `NEXT_PUBLIC_QUICKENGINE_ADMIN_URL` → `NEXT_PUBLIC_QUICKENGINE_DASHBOARD_URL` (QuickDash's admin URLs unchanged).
- Consolidated authentication to a single authority: removed the admin app's Better Auth handler so the auth app is the sole identity provider; added trusted origins, rate limiting, Next.js cookie handling, and shared `getSession` / `requireSession` helpers in `@quickengine/auth`.
- Authentication now requires email verification and sends verification and password-reset emails through the email provider.
- Added passwordless sign-in: email OTP and magic link, both delivered through the email provider (they reuse the existing verification table — no migration).
- Reduced the app registry and shared types to the two real apps: QuickEngine (the account layer) and QuickDash (the single flagship product), matching the single-flagship direction.
- Renamed subscription plan tiers to the Free / Starter / Pro / Growth / Team ladder plus Enterprise.
- Decoupled subscriptions from per-app identifiers, so billing is tier-based rather than per-app.
- Stripped the QuickEngine web front page to a bare black canvas ahead of a rebuild.
- Regenerated the baseline database migration to match the realigned schema.

### Removed

- The `/dev` consoles — the auth flow test surface (`auth/dev`) and the billing dev console (`web/dev/billing`). They were scaffolding; the real sign-in/up screens now cover auth, and account/billing management is moving into the dashboard. Checkout success/cancel pages link home instead of the removed console. (A fresh dev/test surface can be added later if needed.)
- ~5 MB of unused font kits from `web/public` (`GeneralSans_Complete`, `ClashGrotesk_Complete`) — fonts are now served once from `@quickengine/ui`.
- The original QuickFlow app scaffolding: its web/admin URLs, `quickflow_workspaces` schema, and legacy app-registry entry were coupled to the retired per-app architecture. A future QuickFlow product will be rebuilt after QuickDash around shared identity plus stable event/action contracts rather than reviving that implementation or folding the engine into a dashboard module.
- The retired standalone-app registry entries (PDF, Image, Web, Text, and Dev tools, converters, business, productivity, AI, health, and video/audio). These are QuickDash modules or workspace types, not apps.
- The per-app catalog (`quickengine_apps`) and per-app entitlement (`quickengine_entitlements`) tables, which encoded the old per-app billing model.

### Fixed

- Blank optional env vars broke the production build. A set-but-empty variable (e.g. `AUTH_COOKIE_DOMAIN=`) was converted to `undefined` and then failed its inner `string` check, so `next build` errored even though the field was marked optional. The `emptyStringAsUndefined` helper now makes the inner schema optional, so a blank value is correctly treated as unset. This blocked building the auth app locally.
- Tailwind CSS was never compiling — no app had a PostCSS config. Added `postcss.config.mjs` to web, admin, and auth, plus a Tailwind `@source` for `@quickengine/ui`, so utility classes and the shared shadcn component styles actually render. Rebuilt the auth dev console on shadcn components.
- Removed the deprecated `baseUrl` from the web, admin, and auth tsconfigs (path aliases resolve without it), clearing the TypeScript 7.0 deprecation error.
- Associated auth-panel form labels with their inputs via `htmlFor`/`id`.

### Security

- The dashboard requires a valid session: unauthenticated visitors are redirected to the auth app's sign-in (carrying a redirect back), and every dashboard response is served `no-store` (via Next 16's `proxy` convention, the successor to the deprecated `middleware`) so the browser back button can't reveal account content after sign-out.
- Signed-in users are redirected away from the sign-in / sign-up pages. Each page is now a server component that checks the session before rendering, so an already-authenticated visitor is sent to their destination instead of the login form — the browser back button can no longer park a live session back on `/signin`. The redirect target is validated against our own app origins (shared open-redirect guard), same on the server and client.
- Added root pnpm overrides for `esbuild` and `postcss` to force patched transitive versions and clear Dependabot alerts.

## [0.1.0] - Foundation

### Added

- Initial QuickEngine monorepo scaffold.
- QuickEngine web and admin app shells.
- Shared packages for auth, database, UI, env, billing, cache, email, jobs, monitoring, search, storage, realtime, analytics, SDK, and app metadata.
- Root environment example and typed env validation.
- GitHub Actions CI and secrets scan workflows.
- Dependabot configuration.
- Husky and lint-staged setup.
- Gitleaks allowlist for non-secret historical placeholders.
- Stripe checkout and webhook scaffolds.
- QuickEngine web deployment to `https://quickengine.vercel.app`.
- Internal build checklist and priority order docs.

### Changed

- Repository prepared for public visibility.
- Polar/Reown references removed from active billing setup in favor of Stripe.
- QuickDash and other product apps parked until QuickEngine foundation is ready.

### Notes

- Release automation is intentionally disabled until versioning policy is finalized.
- Current version remains `0.1.0` while auth, account, billing, and launch foundations are built.
