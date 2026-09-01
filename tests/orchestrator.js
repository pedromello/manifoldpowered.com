import { createHash, randomUUID } from "node:crypto";
import retry from "async-retry";
import * as database from "infra/database";
import storage from "infra/storage";
import user from "models/user";
import session from "models/session";
import { faker } from "@faker-js/faker";
import activation from "models/activation";
import webserver from "infra/webserver";
import game from "models/game";
import library from "models/library";
import store from "models/store";
import storeCuration from "models/store_curation";
import studio from "models/studio";
import authorization from "models/authorization";
import currency from "models/currency";
import exchangeRate from "models/exchange_rate";
import pricing from "models/pricing";
import ledger from "models/ledger";
import commercialTerms from "models/commercial_terms";
import payoutAccount from "models/payout_account";
import { Prisma } from "generated/prisma/client";

const EMAIL_HTTP_URL = `http://${process.env.EMAIL_HTTP_HOST}:${process.env.EMAIL_HTTP_PORT}`;

const DO_NOT_FAKE_TIMERS_FOR_PRISMA = [
  "hrtime",
  "nextTick",
  "performance",
  "queueMicrotask",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "setImmediate",
  "clearImmediate",
  "setInterval",
  "clearInterval",
  "setTimeout",
  "clearTimeout",
];

const createTestClientAddress = (suiteId) => {
  const digest = createHash("sha256").update(suiteId).digest("hex");
  const groups = [0, 4, 8, 12].map((offset) =>
    digest.slice(offset, offset + 4),
  );

  return `2001:db8:${groups.join(":")}`;
};

const waitForAllServices = async () => {
  await waitForWebServer();
  await waitForEmailServer();

  async function waitForWebServer() {
    await retry(
      async () => {
        const response = await fetch(`${webserver.getOrigin()}/api/v1/status`);
        if (response.status !== 200) {
          throw new Error("Web server is not ready");
        }
      },
      { retries: 100, maxTimeout: 1000 },
    );
  }

  async function waitForEmailServer() {
    await retry(
      async () => {
        const response = await fetch(`${EMAIL_HTTP_URL}`);
        if (response.status !== 200) {
          throw new Error("Email server is not ready");
        }
      },
      { retries: 100, maxTimeout: 1000 },
    );
  }
};

const clearDatabase = async () => {
  await database.clearDatabase();
};

const clearDatabaseRows = async () => {
  await database.clearDatabaseRows();
};

const createUser = async (userDto = {}) => {
  return user.create({
    username:
      userDto.username || faker.internet.username().replace(/[_.-]/g, ""),
    email: userDto.email || faker.internet.email(),
    password:
      userDto.password !== undefined
        ? userDto.password
        : faker.internet.password(),
  });
};

const getUserById = async (userId) => {
  return user.findOneById(userId);
};

const activateUser = async (userId) => {
  return activation.activateUserByUserId(userId);
};

const addFeaturesToUser = async (userId, features) => {
  return user.addFeatures(userId, features);
};

const createAdminUser = async (userDto = {}) => {
  const createdUser = await createUser(userDto);
  await activateUser(createdUser.id);
  await addFeaturesToUser(createdUser.id, authorization.ADMIN_ONLY_FEATURES);
  return getUserById(createdUser.id);
};

const disableUser = async (userId) => {
  return user.disable(userId);
};

const createSession = async (userId) => {
  return session.create(userId);
};

// Emails
const deleteAllEmails = async () => {
  // There is no method to delete all emails through the transporter, so we use the HTTP API
  await fetch(`${EMAIL_HTTP_URL}/messages`, {
    method: "DELETE",
  });
};

const getLastEmail = async () => {
  const emailListResponse = await fetch(`${EMAIL_HTTP_URL}/messages`);
  const emailList = await emailListResponse.json();

  const lastEmail = emailList.pop();

  if (!lastEmail) {
    return null;
  }

  const emailContentResponse = await fetch(
    `${EMAIL_HTTP_URL}/messages/${lastEmail.id}.plain`,
  );
  const emailContent = await emailContentResponse.text();

  lastEmail.text = emailContent;
  return lastEmail;
};

const extractUUID = (text) => {
  const regex = /[0-9a-fA-F-]{36}/;
  const match = text.match(regex);
  return match ? match[0] : null;
};

const extractOtpCode = (text) => {
  const regex = /\b\d{6}\b/;
  const match = text.match(regex);
  return match ? match[0] : null;
};

// faker.commerce.productName() draws from a finite set, and game slugs must be
// globally unique across the full integration suite. Keep generated titles
// readable while making the fixture identity collision-resistant.
const uniqueFakerGameTitle = () =>
  `${faker.commerce.productName()} ${faker.string.alphanumeric(8)}`;

// Games
const createGame = async (userId, gameData = {}) => {
  let studioId = gameData.studio_id;

  if (!studioId) {
    const soloStudio = await createStudio(userId, { is_publisher: true });
    studioId = soloStudio.id;
  }

  return game.create({
    studio_id: studioId,
    publisher_id: gameData.publisher_id || undefined,
    title: gameData.title || uniqueFakerGameTitle(),
    description: gameData.description || faker.lorem.sentence(),
    detailed_description:
      gameData.detailed_description || faker.lorem.paragraph(),
    launch_date: gameData.launch_date || faker.date.past(),
    price: gameData.price === undefined ? faker.number.float() : gameData.price,
    tags: gameData.tags || [faker.lorem.word()],
    meta_tags: gameData.meta_tags || {},
    media: gameData.media || { screenshots: [], videos: [] },
    social_links: gameData.social_links || {},
    requirements: gameData.requirements || undefined,
  });
};

const getGameBySlug = async (slug) => {
  return game.findOneBySlug(slug);
};

const addToLibrary = async (userId, itemId, itemType = "GAME") => {
  return library.add(userId, itemId, itemType);
};

const getFileDownloadUrl = async (fileUrl) => {
  return storage.getDownloadUrl(fileUrl);
};

const clearStorage = async () => {
  await storage.clearAllBuckets();
  await storage.createBucket();
};

// faker.company.name() draws from a finite pool, so plain repeated calls
// across a full suite run eventually collide on the slug studio/store
// derive from the name. Suffix with a random string to keep names unique.
const uniqueFakerName = () =>
  `${faker.company.name()} ${faker.string.alphanumeric(8)}`;

// Stores
const createStore = async (ownerId, storeData = {}) => {
  const createdStore = await store.create({
    name: storeData.name || uniqueFakerName(),
    description:
      storeData.description === undefined
        ? faker.lorem.sentence()
        : storeData.description,
    logo_url: storeData.logo_url,
    layout_preset: storeData.layout_preset,
    tagline: storeData.tagline,
    cover_url: storeData.cover_url,
    social_links: storeData.social_links,
    brand_tokens: storeData.brand_tokens,
    owner_id: ownerId,
  });

  // Most pre-lifecycle fixtures model legacy public Outlets. New lifecycle
  // tests opt into the production default explicitly with `{ draft: true }`.
  if (storeData.draft === true) return createdStore;

  // Seed the same grandfathered state produced by the rollout migration.
  // Production publish intentionally enforces readiness; forcing all legacy
  // test fixtures to create five catalog games and a complete creator profile
  // would obscure what those unrelated tests are actually exercising.
  return database.prisma.$transaction(async (transaction) => {
    const revision = await transaction.storeRevision.create({
      data: {
        store_id: createdStore.id,
        revision_number: 1,
        source_draft_revision: createdStore.draft_revision,
        created_by: ownerId,
        name: createdStore.name,
        description: createdStore.description,
        logo_url: createdStore.logo_url,
        theme_key: createdStore.theme_key,
        layout_preset: createdStore.layout_preset,
        tagline: createdStore.tagline,
        cover_url: createdStore.cover_url,
        social_links: createdStore.social_links,
        brand_tokens: createdStore.brand_tokens,
        curation_strategy: "NONE",
        featured_games: [],
        tag_filters: [],
        game_overrides: [],
      },
    });
    const publishedAt = new Date();
    const publishedStore = await transaction.store.update({
      where: { id: createdStore.id },
      data: {
        publication_status: "PUBLISHED",
        published_revision_id: revision.id,
        published_at: publishedAt,
      },
    });
    return { ...publishedStore, published_revision: revision };
  });
};

const publishStore = async (storeItem, actorId = storeItem.owner_id) =>
  store.publish(storeItem.id, actorId, storeItem.draft_revision);

const addStoreMember = async (storeId, username, permissions) => {
  return store.addMember(storeId, username, permissions);
};

// Store Curation
const addStoreTagFilter = async (storeId, tag, mode) => {
  return storeCuration.addTagFilter(storeId, tag, mode);
};

const addStoreGameOverride = async (storeId, gameSlug, visibility) => {
  return storeCuration.addGameOverride(storeId, gameSlug, visibility);
};

// Studios
const createStudio = async (ownerId, studioData = {}) => {
  return studio.create({
    name: studioData.name || uniqueFakerName(),
    description: studioData.description || faker.lorem.sentence(),
    is_publisher: studioData.is_publisher || false,
    owner_id: ownerId,
  });
};

const addStudioMember = async (studioId, username, permissions) => {
  return studio.addMember(studioId, username, permissions);
};

// Currencies and exchange rates
const createCurrency = async (currencyData = {}) => {
  return currency.create({
    code: currencyData.code || "USD",
    symbol: currencyData.symbol || "$",
    decimal_places:
      currencyData.decimal_places === undefined
        ? 2
        : currencyData.decimal_places,
    enabled: currencyData.enabled === undefined ? true : currencyData.enabled,
  });
};

const setGamePriceOverride = async (gameId, currencyCode, amount) => {
  return pricing.setOverride(gameId, { currency: currencyCode, amount });
};

const createExchangeRate = async (rateData = {}) => {
  return exchangeRate.record({
    base_currency: rateData.base_currency || "USD",
    quote_currency: rateData.quote_currency || "BRL",
    rate: rateData.rate === undefined ? 5 : rateData.rate,
    source: rateData.source || "MANUAL",
    effective_at: rateData.effective_at || new Date(),
  });
};

// Commercial terms
const setStoreCommissionRate = async (storeId, rate) => {
  return commercialTerms.setCommissionRate(
    storeId,
    rate === null ? null : new Prisma.Decimal(String(rate)),
  );
};

// Payout accounts
const createPayoutAccount = async (storeId, accountData = {}) => {
  return payoutAccount.create(storeId, {
    provider: accountData.provider || "STRIPE",
    payout_currency: accountData.payout_currency || "USD",
    label: accountData.label,
  });
};

// The verification gate, from the side a provider or an admin writes it. Tests
// that need a payable outlet seed it here rather than through the backoffice
// endpoint, and a provider_account_id can be planted to prove it never comes
// back out of an API response.
const enablePayouts = async (storeId, providerAccountId) => {
  return payoutAccount.setProviderState(storeId, {
    payouts_enabled: true,
    provider_account_id: providerAccountId || `acct_${randomUUID()}`,
  });
};

const setSupplierTerms = async (termsData = {}) => {
  return commercialTerms.setSupplierTerms({
    supplier_type: termsData.supplier_type || "STUDIO",
    supplier_id: termsData.supplier_id,
    cost_rate: new Prisma.Decimal(
      String(termsData.cost_rate === undefined ? 0.7 : termsData.cost_rate),
    ),
  });
};

// Ledger
const recordLedgerEntries = async (entries, sourceData = {}) => {
  return ledger.record({
    source_type: sourceData.source_type || "SALE",
    source_id: sourceData.source_id || randomUUID(),
    entries,
  });
};

// The shape almost every ledger test needs: one sale distributed across the
// accounts it touches, already balanced. Amounts follow the sign convention in
// models/ledger — positive is money the platform received, negative is money it
// owes or spent.
//
// With no store_id this writes a three-entry set and no commission at all,
// which is the global-storefront sale (Sale.store_id is nullable, and null
// means no store attribution). Emitting an unowned commission instead would
// book a liability owed to nobody.
const recordLedgerSale = async (saleData = {}) => {
  const gross = saleData.gross === undefined ? 100 : saleData.gross;
  const supplierCost =
    saleData.supplier_cost === undefined ? 70 : saleData.supplier_cost;
  const currencyCode = saleData.currency || "USD";
  const maturesAt =
    saleData.matures_at === undefined
      ? ledger.maturityFor()
      : saleData.matures_at;

  const commission = saleData.store_id
    ? saleData.commission === undefined
      ? 10
      : saleData.commission
    : 0;

  const entries = [
    {
      account_type: "CONSUMER_PAYMENT",
      amount: gross,
      currency: currencyCode,
    },
    {
      account_type: "SUPPLIER_COST",
      amount: -supplierCost,
      currency: currencyCode,
    },
    {
      // Decimal, not JavaScript numbers: a fractional gross or commission
      // would leave a float residue and fail the zero-sum check, which would
      // read as a model bug rather than a helper bug.
      account_type: "PLATFORM_REVENUE",
      amount: new Prisma.Decimal(gross)
        .minus(supplierCost)
        .minus(commission)
        .negated(),
      currency: currencyCode,
    },
  ];

  if (saleData.store_id) {
    entries.push({
      account_type: "AFFILIATE_COMMISSION",
      // The outlet is the payee, not whoever owns it.
      owner_type: "STORE",
      owner_id: saleData.store_id,
      amount: -commission,
      currency: currencyCode,
      matures_at: maturesAt,
    });
  }

  return recordLedgerEntries(entries, {
    source_type: "SALE",
    source_id: saleData.source_id,
  });
};

const orchestrator = {
  createTestClientAddress,
  waitForAllServices,
  clearDatabase,
  clearDatabaseRows,
  createUser,
  activateUser,
  createAdminUser,
  disableUser,
  createSession,
  deleteAllEmails,
  getLastEmail,
  extractUUID,
  addFeaturesToUser,
  getUserById,
  createGame,
  getGameBySlug,
  clearStorage,
  addToLibrary,
  DO_NOT_FAKE_TIMERS_FOR_PRISMA,
  getFileDownloadUrl,
  createStore,
  publishStore,
  addStoreMember,
  addStoreTagFilter,
  addStoreGameOverride,
  createStudio,
  addStudioMember,
  extractOtpCode,
  createCurrency,
  createExchangeRate,
  setGamePriceOverride,
  recordLedgerEntries,
  recordLedgerSale,
  setStoreCommissionRate,
  setSupplierTerms,
  createPayoutAccount,
  enablePayouts,
};

export default orchestrator;
