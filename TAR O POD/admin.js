
const SUPABASE_URL = "https://mubrlmoypxlysysbaccs.supabase.co";
const SUPABASE_KEY = "sb_publishable_EpUr-dPOOmMqEM1LYb5rKQ_VrwyVAAA";
const ADMIN_UID = "767c0cd0-0e36-484f-9e0e-0414101fb5a3";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = id => document.getElementById(id);

let categories = [];
let products = [];
let discounts = [];
let discountRedemptions = [];

/* وضعیت سیستم اتورفرش و Realtime */

let realtimeStarted = false;
let autoRefreshTimer = null;
let realtimeRefreshTimer = null;
let refreshRunning = false;
let refreshPending = false;
let adminChannels = [];
let adminIsActive = false;
let adminSessionVersion = 0;

/* ابزارهای عمومی */

function showMessage(id, message) {
  const el = $(id);
  if (!el) return;

  el.textContent = message;
  el.classList.remove("hidden");
}

function hideMessage(id) {
  const el = $(id);
  if (el) el.classList.add("hidden");
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[c]);
}

function formatPrice(value) {
  return Number(value || 0).toLocaleString("fa-IR") + " تومان";
}

function formatDate(value) {
  if (!value) return "تعیین نشده";
  return new Date(value).toLocaleString("fa-IR");
}

function toLocalDateTime(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);
}

/* قیمت محصولات */

function getOriginalPrice(product) {
  return Number(product.original_price ?? product.price ?? 0);
}

function getSalePrice(product) {
  if (!product.sale_active) return null;

  if (
    product.sale_price === null ||
    product.sale_price === undefined
  ) {
    return null;
  }

  const sale = Number(product.sale_price);
  const original = getOriginalPrice(product);

  return sale >= 0 && sale < original ? sale : null;
}

function getFinalPrice(product) {
  return getSalePrice(product) ?? Number(product.price || 0);
}

function calculateDiscountPercent(original, sale) {
  if (!original || sale === null || sale >= original) return 0;

  return Math.round((1 - sale / original) * 100);
}

/* افزودن فیلد قیمت تخفیفی */

function addSaleFieldsToAddForm() {
  const priceInput = $("productPrice");

  if (!priceInput || $("productSalePrice")) return;

  const label = priceInput.previousElementSibling;

  if (label) {
    label.textContent = "قیمت اصلی محصول به تومان";
  }

  const saleLabel = document.createElement("label");
  saleLabel.htmlFor = "productSalePrice";
  saleLabel.textContent = "قیمت تخفیفی محصول (اختیاری)";

  const saleInput = document.createElement("input");
  saleInput.id = "productSalePrice";
  saleInput.type = "number";
  saleInput.min = "0";
  saleInput.placeholder = "خالی بگذار تا محصول بدون تخفیف باشد";

  const info = document.createElement("p");
  info.id = "productSaleInfo";
  info.className = "section-note";

  info.textContent =
    "با وارد کردن قیمت کمتر، تخفیف محصول به‌صورت خودکار محاسبه می‌شود.";

  priceInput.insertAdjacentElement("afterend", saleLabel);
  saleLabel.insertAdjacentElement("afterend", saleInput);
  saleInput.insertAdjacentElement("afterend", info);

  priceInput.addEventListener("input", updateNewProductDiscount);
  saleInput.addEventListener("input", updateNewProductDiscount);
}

function updateNewProductDiscount() {
  const original = Number($("productPrice")?.value);
  const saleText = $("productSalePrice")?.value;
  const info = $("productSaleInfo");

  if (!info) return;

  if (!saleText) {
    info.textContent = "محصول بدون تخفیف ثبت خواهد شد.";
    return;
  }

  const sale = Number(saleText);

  if (
    !Number.isFinite(original) ||
    original <= 0 ||
    !Number.isFinite(sale) ||
    sale < 0 ||
    sale >= original
  ) {
    info.textContent = "قیمت تخفیفی باید کمتر از قیمت اصلی باشد.";
    return;
  }

  info.textContent =
    "میزان تخفیف: " +
    calculateDiscountPercent(original, sale).toLocaleString("fa-IR") +
    " درصد | قیمت نهایی: " + formatPrice(sale);
}

/* ویرایش نام محصول */

function createProductNameEditor(product) {
  const box = document.createElement("div");

  box.style.cssText =
    "margin:12px 0;padding:14px;background:#faf7f2;border-radius:12px";

  const label = document.createElement("label");
  label.textContent = "نام محصول";

  const input = document.createElement("input");
  input.type = "text";
  input.value = product.name || "";
  input.placeholder = "نام جدید محصول";

  input.style.cssText =
    "width:100%;padding:12px;margin:8px 0;border:1px solid #ddd;border-radius:10px;font-family:inherit";

  const button = document.createElement("button");
  button.textContent = "ذخیره نام";

  button.addEventListener("click", async () => {
    const name = input.value.trim();

    if (!name) {
      alert("نام محصول نمی‌تواند خالی باشد.");
      return;
    }

    button.disabled = true;
    button.textContent = "در حال ذخیره...";

    try {
      const { error } = await db
        .from("products")
        .update({ name })
        .eq("id", product.id);

      if (error) throw error;

      await loadProducts();

      alert("نام محصول با موفقیت تغییر کرد.");

    } catch (error) {
      alert("تغییر نام ناموفق بود: " + error.message);

    } finally {
      button.disabled = false;
      button.textContent = "ذخیره نام";
    }
  });

  box.append(label, input, button);

  return box;
}

/* تغییر تصویر محصول و پیش‌نمایش */

function createProductImageEditor(product) {
  const box = document.createElement("div");

  box.style.cssText =
    "margin:12px 0;padding:15px;background:#f7f2eb;border-radius:12px";

  const title = document.createElement("h4");
  title.textContent = "تغییر تصویر محصول";
  title.style.margin = "0 0 12px";

  const preview = document.createElement("img");
  preview.src = product.image_url || "";
  preview.alt = product.name || "تصویر محصول";

  preview.style.cssText =
    "display:block;width:100%;max-width:230px;height:180px;object-fit:cover;border-radius:12px;margin:10px 0;background:#eee";

  if (!product.image_url) {
    preview.style.display = "none";
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.cssText = "display:block;margin:12px 0";

  const info = document.createElement("p");
  info.className = "section-note";
  info.textContent = "یک تصویر جدید انتخاب کن تا پیش‌نمایش آن نمایش داده شود.";

  const button = document.createElement("button");
  button.textContent = "ذخیره تصویر جدید";
  button.disabled = true;

  let selectedFile = null;
  let previewUrl = null;

  input.addEventListener("change", () => {
    const file = input.files?.[0];

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }

    selectedFile = null;
    button.disabled = true;

    if (!file) {
      preview.src = product.image_url || "";
      preview.style.display = product.image_url ? "block" : "none";
      info.textContent = "تصویری انتخاب نشده است.";
      return;
    }

    if (!file.type.startsWith("image/")) {
      input.value = "";
      preview.src = product.image_url || "";
      preview.style.display = product.image_url ? "block" : "none";
      info.textContent = "فایل انتخاب‌شده تصویر معتبر نیست.";
      alert("لطفاً یک فایل تصویری انتخاب کن.");
      return;
    }

    selectedFile = file;
    previewUrl = URL.createObjectURL(file);

    preview.src = previewUrl;
    preview.style.display = "block";

    info.textContent = "تصویر جدید انتخاب شد: " + file.name;

    button.disabled = false;
  });

  button.addEventListener("click", async () => {
    if (!selectedFile) {
      alert("ابتدا یک تصویر انتخاب کن.");
      return;
    }

    button.disabled = true;
    input.disabled = true;
    button.textContent = "در حال بارگذاری تصویر...";

    let uploadedPath = null;

    try {
      const safeName = selectedFile.name
        .replace(/[^a-zA-Z0-9._-]/g, "_");

      uploadedPath =
        Date.now() + "_" +
        Math.random().toString(36).slice(2) + "_" +
        safeName;

      const { error: uploadError } = await db.storage
        .from("product-images")
        .upload(uploadedPath, selectedFile, {
          cacheControl: "3600",
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: imageData } = db.storage
        .from("product-images")
        .getPublicUrl(uploadedPath);

      if (!imageData?.publicUrl) {
        throw new Error("دریافت آدرس تصویر جدید ناموفق بود.");
      }

      const { error: updateError } = await db
        .from("products")
        .update({
          image_url: imageData.publicUrl
        })
        .eq("id", product.id);

      if (updateError) throw updateError;

      info.textContent = "تصویر جدید با موفقیت ذخیره شد.";

      await loadProducts();

      alert("تصویر محصول با موفقیت تغییر کرد.");

    } catch (error) {
      if (uploadedPath) {
        await db.storage
          .from("product-images")
          .remove([uploadedPath]);
      }

      alert("تغییر تصویر ناموفق بود: " + error.message);

      button.disabled = false;
      input.disabled = false;
      button.textContent = "ذخیره تصویر جدید";
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
  });

  box.append(title, preview, input, info, button);

  return box;
}

/* ویرایش قیمت و تخفیف */

function createProductPriceEditor(product) {
  const box = document.createElement("div");

  box.style.cssText =
    "margin:15px 0;padding:15px;background:#f7f2eb;border-radius:12px";

  const originalLabel = document.createElement("label");
  originalLabel.textContent = "قیمت اصلی محصول (تومان)";

  const originalInput = document.createElement("input");
  originalInput.type = "number";
  originalInput.min = "0";
  originalInput.value = getOriginalPrice(product);

  const saleLabel = document.createElement("label");
  saleLabel.textContent = "قیمت تخفیفی محصول";

  const saleInput = document.createElement("input");
  saleInput.type = "number";
  saleInput.min = "0";
  saleInput.placeholder = "خالی = بدون تخفیف";
  saleInput.value = getSalePrice(product) ?? "";

  const info = document.createElement("p");
  info.className = "section-note";

  const updateInfo = () => {
    const original = Number(originalInput.value);
    const saleText = saleInput.value;

    if (!saleText) {
      info.textContent = "این محصول بدون تخفیف خواهد بود.";
      return;
    }

    const sale = Number(saleText);

    if (
      !Number.isFinite(original) ||
      original <= 0 ||
      !Number.isFinite(sale) ||
      sale < 0 ||
      sale >= original
    ) {
      info.textContent = "قیمت تخفیفی باید کمتر از قیمت اصلی باشد.";
      return;
    }

    info.textContent =
      "تخفیف: " +
      calculateDiscountPercent(original, sale).toLocaleString("fa-IR") +
      " درصد | قیمت نهایی: " + formatPrice(sale);
  };

  originalInput.addEventListener("input", updateInfo);
  saleInput.addEventListener("input", updateInfo);

  updateInfo();

  const saveButton = document.createElement("button");
  saveButton.textContent = "ذخیره قیمت و تخفیف";

  saveButton.addEventListener("click", async () => {
    const original = Number(originalInput.value);
    const saleText = saleInput.value.trim();

    const sale = saleText === "" ? null : Number(saleText);

    if (!Number.isFinite(original) || original <= 0) {
      alert("قیمت اصلی باید بیشتر از صفر باشد.");
      return;
    }

    if (
      sale !== null &&
      (
        !Number.isFinite(sale) ||
        sale < 0 ||
        sale >= original
      )
    ) {
      alert("قیمت تخفیفی باید کمتر از قیمت اصلی باشد.");
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "در حال ذخیره...";

    try {
      const finalPrice = sale === null ? original : sale;

      const { error } = await db
        .from("products")
        .update({
          original_price: original,
          sale_price: sale,
          sale_active: sale !== null,
          price: finalPrice
        })
        .eq("id", product.id);

      if (error) throw error;

      await loadProducts();
      await loadDashboardStats();

      alert("قیمت و تخفیف محصول ذخیره شد.");

    } catch (error) {
      alert("ذخیره قیمت ناموفق بود: " + error.message);

    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "ذخیره قیمت و تخفیف";
    }
  });

  box.append(
    originalLabel,
    originalInput,
    saleLabel,
    saleInput,
    info,
    saveButton
  );

  return box;
}

/* ویرایش توضیحات محصول */

function createProductDescriptionEditor(product) {
  const box = document.createElement("div");

  box.style.cssText =
    "margin:12px 0;padding:14px;background:#faf7f2;border-radius:12px";

  const label = document.createElement("label");
  label.textContent = "توضیحات محصول";

  const textarea = document.createElement("textarea");
  textarea.value = product.description || "";
  textarea.rows = 4;
  textarea.placeholder = "توضیحات محصول را بنویس...";

  textarea.style.cssText =
    "width:100%;min-height:90px;padding:12px;margin-top:8px;border:1px solid #ddd;border-radius:10px;font-family:inherit;resize:vertical";

  const saveButton = document.createElement("button");
  saveButton.textContent = "ذخیره توضیحات";

  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    saveButton.textContent = "در حال ذخیره...";

    try {
      const { error } = await db
        .from("products")
        .update({
          description: textarea.value.trim()
        })
        .eq("id", product.id);

      if (error) throw error;

      await loadProducts();

      alert("توضیحات محصول با موفقیت ذخیره شد.");

    } catch (error) {
      alert("ذخیره توضیحات ناموفق بود: " + error.message);

    } finally {
      saveButton.disabled = false;
      saveButton.textContent = "ذخیره توضیحات";
    }
  });

  box.append(label, textarea, saveButton);

  return box;
}

/* داشبورد */

function createDashboardStats() {
  const dashboard = $("dashboardSection");

  if (!dashboard || $("dashboardStats")) return;

  const stats = document.createElement("div");
  stats.id = "dashboardStats";

  stats.style.cssText =
    "display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:15px;margin-bottom:25px";

  [
    ["statProducts", "🧶 کل محصولات"],
    ["statOrders", "📦 کل سفارش‌ها"],
    ["statPendingOrders", "⏳ سفارش‌های در انتظار"],
    ["statPendingReviews", "💬 نظرات در انتظار تأیید"]
  ].forEach(([id, title]) => {
    const card = document.createElement("div");
    card.id = id;

    card.style.cssText =
      "background:#f7f0e7;border:1px solid #e5d8c8;border-radius:16px;padding:20px";

    const heading = document.createElement("div");
    heading.textContent = title;

    const value = document.createElement("strong");
    value.className = "stat-value";
    value.textContent = "در حال دریافت...";
    value.style.cssText =
      "display:block;font-size:25px;margin-top:12px";

    card.append(heading, value);
    stats.appendChild(card);
  });

  dashboard.insertBefore(stats, dashboard.firstChild);
}

function updateStat(id, value) {
  const el = $(id)?.querySelector(".stat-value");

  if (el) {
    el.textContent = value === null
      ? "خطا"
      : Number(value).toLocaleString("fa-IR");
  }
}

async function loadDashboardStats() {
  createDashboardStats();

  const results = await Promise.all([
    db.from("products").select("id", { count: "exact", head: true }),
    db.from("orders").select("id", { count: "exact", head: true }),
    db.from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "در انتظار بررسی"),
    db.from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("is_approved", false)
  ]);

  [
    "statProducts",
    "statOrders",
    "statPendingOrders",
    "statPendingReviews"
  ].forEach((id, i) => {
    updateStat(id, results[i].error ? null : results[i].count ?? 0);
  });
}

/* تنظیمات فروشگاه */

async function loadSettings() {
  const { data, error } = await db
    .from("store_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    showMessage(
      "settingsMessage",
      "دریافت تنظیمات ناموفق بود: " + error.message
    );
    return;
  }

  if (!data) return;

  if ($("storeName")) $("storeName").value = data.name || "";
  if ($("storeDescription")) $("storeDescription").value = data.description || "";
  if ($("storePhone")) $("storePhone").value = data.phone || "";
  if ($("storeWhatsapp")) $("storeWhatsapp").value = data.whatsapp || "";

  if ($("productColumns")) {
    $("productColumns").value = String(
      Math.min(6, Math.max(1, Number(data.product_columns) || 2))
    );
  }
}

$("settingsForm").addEventListener("submit", async event => {
  event.preventDefault();
  hideMessage("settingsMessage");

  const columns = Number($("productColumns").value);

  if (!Number.isInteger(columns) || columns < 1 || columns > 6) {
    showMessage("settingsMessage", "تعداد ستون‌ها باید بین ۱ تا ۶ باشد.");
    return;
  }

  const { error } = await db.from("store_settings").upsert({
    id: 1,
    name: $("storeName").value.trim(),
    description: $("storeDescription").value.trim(),
    phone: $("storePhone").value.trim(),
    whatsapp: $("storeWhatsapp").value.trim(),
    product_columns: columns
  }, { onConflict: "id" });

  if (error) {
    showMessage(
      "settingsMessage",
      "ذخیره تنظیمات ناموفق بود: " + error.message
    );
    return;
  }

  showMessage("settingsMessage", "تنظیمات با موفقیت ذخیره شد.");
});

/* دسته‌بندی‌ها */

async function loadCategories() {
  const list = $("categoryList");
  if (!list) return;

  list.textContent = "در حال دریافت دسته‌بندی‌ها...";

  const { data, error } = await db
    .from("categories")
    .select("*")
    .order("name");

  if (error) {
    list.textContent =
      "دریافت دسته‌بندی‌ها ناموفق بود: " + error.message;
    return;
  }

  categories = data || [];

  renderCategories();
  updateProductCategorySelect();
}

function updateProductCategorySelect() {
  const select = $("productCategory");
  if (!select) return;

  const current = select.value;

  select.innerHTML = '<option value="">بدون دسته‌بندی</option>';

  categories.forEach(category => {
    const option = document.createElement("option");
    option.value = String(category.id);
    option.textContent = category.name;
    select.appendChild(option);
  });

  if (categories.some(c => String(c.id) === current)) {
    select.value = current;
  }
}

function renderCategories() {
  const list = $("categoryList");
  if (!list) return;

  list.innerHTML = "";

  if (!categories.length) {
    list.textContent = "هنوز دسته‌بندی‌ای ساخته نشده است.";
    return;
  }

  categories.forEach(category => {
    const item = document.createElement("div");
    item.className = "category-item";

    const name = document.createElement("div");
    name.className = "category-name";
    name.textContent = category.name;

    const related = products.filter(
      p => String(p.category_id) === String(category.id)
    );

    const count = document.createElement("p");
    count.className = "section-note";
    count.textContent =
      related.length.toLocaleString("fa-IR") +
      " محصول در این دسته‌بندی";

    const productBox = document.createElement("div");
    productBox.style.cssText =
      "margin:12px 0;padding:12px;background:#f7f3ed;border-radius:10px";

    if (!related.length) {
      productBox.textContent = "هنوز محصولی در این دسته‌بندی نیست.";
    } else {
      related.forEach(product => {
        const row = document.createElement("div");

        row.style.cssText =
          "padding:8px 0;border-bottom:1px solid #e5dbd0";

        row.textContent =
          product.name + " | " + formatPrice(getFinalPrice(product));

        productBox.appendChild(row);
      });
    }

    const actions = document.createElement("div");
    actions.className = "category-actions";

    const edit = document.createElement("button");
    edit.className = "secondary";
    edit.textContent = "ویرایش نام";
    edit.addEventListener("click", () => editCategory(category));

    const remove = document.createElement("button");
    remove.className = "danger";
    remove.textContent = "حذف دسته‌بندی";
    remove.addEventListener("click", () => deleteCategory(category));

    actions.append(edit, remove);
    item.append(name, count, productBox, actions);
    list.appendChild(item);
  });
}

$("categoryForm").addEventListener("submit", async event => {
  event.preventDefault();
  hideMessage("categoryMessage");

  const name = $("categoryName").value.trim();

  if (!name) {
    showMessage("categoryMessage", "نام دسته‌بندی را وارد کن.");
    return;
  }

  if (categories.some(c => c.name.trim() === name)) {
    showMessage("categoryMessage", "این دسته‌بندی قبلاً ثبت شده است.");
    return;
  }

  const { error } = await db.from("categories").insert([{ name }]);

  if (error) {
    showMessage(
      "categoryMessage",
      "افزودن دسته‌بندی ناموفق بود: " + error.message
    );
    return;
  }

  $("categoryForm").reset();

  showMessage("categoryMessage", "دسته‌بندی با موفقیت اضافه شد.");

  await loadCategories();
});

async function editCategory(category) {
  const newName = prompt("نام جدید دسته‌بندی را وارد کن:", category.name);
  if (newName === null) return;

  const cleanName = newName.trim();

  if (!cleanName) {
    alert("نام دسته‌بندی نمی‌تواند خالی باشد.");
    return;
  }

  if (categories.some(
    c => c.id !== category.id && c.name.trim() === cleanName
  )) {
    alert("این نام قبلاً استفاده شده است.");
    return;
  }

  const { error } = await db.from("categories")
    .update({ name: cleanName })
    .eq("id", category.id);

  if (error) {
    alert("ویرایش نام ناموفق بود: " + error.message);
    return;
  }

  await loadCategories();
  alert("نام دسته‌بندی تغییر کرد.");
}

async function deleteCategory(category) {
  if (!confirm(
    "دسته‌بندی «" + category.name +
    "» حذف شود؟ محصولات حذف نمی‌شوند."
  )) return;

  const { error } = await db.from("categories")
    .delete()
    .eq("id", category.id);

  if (error) {
    alert("حذف دسته‌بندی ناموفق بود: " + error.message);
    return;
  }

  await loadCategories();
  await loadProducts();

  alert("دسته‌بندی حذف شد.");
}

/* افزودن محصول */

$("productForm").addEventListener("submit", async event => {
  event.preventDefault();
  hideMessage("productMessage");

  const name = $("productName").value.trim();
  const description = $("productDescription").value.trim();
  const originalPrice = Number($("productPrice").value);

  const saleText = $("productSalePrice")?.value.trim() || "";
  const salePrice = saleText === "" ? null : Number(saleText);

  const categoryValue = $("productCategory").value;
  const file = $("productImage").files[0];

  if (
    !name ||
    !Number.isFinite(originalPrice) ||
    originalPrice <= 0 ||
    !file
  ) {
    showMessage(
      "productMessage",
      "نام، قیمت اصلی و تصویر محصول را کامل وارد کن."
    );
    return;
  }

  if (
    salePrice !== null &&
    (
      !Number.isFinite(salePrice) ||
      salePrice < 0 ||
      salePrice >= originalPrice
    )
  ) {
    showMessage(
      "productMessage",
      "قیمت تخفیفی باید کمتر از قیمت اصلی باشد."
    );
    return;
  }

  if (!file.type.startsWith("image/")) {
    showMessage("productMessage", "فایل انتخاب‌شده باید تصویر باشد.");
    return;
  }

  const categoryId = categoryValue ? Number(categoryValue) : null;

  if (
    categoryId !== null &&
    !categories.some(c => Number(c.id) === categoryId)
  ) {
    showMessage("productMessage", "دسته‌بندی انتخاب‌شده معتبر نیست.");
    return;
  }

  const button = $("productForm").querySelector('button[type="submit"]');

  button.disabled = true;
  showMessage("productMessage", "در حال بارگذاری تصویر...");

  let uploadedPath = null;

  try {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");

    uploadedPath =
      Date.now() + "_" +
      Math.random().toString(36).slice(2) + "_" +
      safeName;

    const { error: uploadError } = await db.storage
      .from("product-images")
      .upload(uploadedPath, file, {
        cacheControl: "3600",
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { data: imageData } = db.storage
      .from("product-images")
      .getPublicUrl(uploadedPath);

    if (!imageData?.publicUrl) {
      throw new Error("دریافت آدرس تصویر ناموفق بود.");
    }

    const finalPrice = salePrice === null
      ? originalPrice
      : salePrice;

    const { error: insertError } = await db.from("products").insert([{
      name,
      description,
      price: finalPrice,
      original_price: originalPrice,
      sale_price: salePrice,
      sale_active: salePrice !== null,
      image_url: imageData.publicUrl,
      category_id: categoryId
    }]);

    if (insertError) throw insertError;

    uploadedPath = null;

    $("productForm").reset();
    updateNewProductDiscount();

    showMessage("productMessage", "محصول با موفقیت ثبت شد.");

    await loadProducts();
    await loadDashboardStats();

  } catch (error) {
    if (uploadedPath) {
      await db.storage
        .from("product-images")
        .remove([uploadedPath]);
    }

    showMessage(
      "productMessage",
      "ثبت محصول ناموفق بود: " + error.message
    );

  } finally {
    button.disabled = false;
  }
});

/* مدیریت محصولات */

async function loadProducts() {
  const list = $("productList");
  if (!list) return;

  list.textContent = "در حال دریافت محصولات...";

  const { data, error } = await db
    .from("products")
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    list.textContent = "دریافت محصولات ناموفق بود: " + error.message;
    return;
  }

  products = data || [];

  renderProducts();
  renderCategories();
}

function renderProducts() {
  const list = $("productList");
  if (!list) return;

  list.innerHTML = "";

  if (!products.length) {
    list.textContent = "هنوز محصولی ثبت نشده است.";
    return;
  }

  products.forEach(product => {
    const item = document.createElement("div");
    item.className = "product-item";

    if (product.image_url) {
      const image = document.createElement("img");
      image.src = product.image_url;
      image.alt = product.name || "محصول";
      image.loading = "lazy";
      item.appendChild(image);
    }

    const title = document.createElement("h3");
    title.textContent = product.name || "محصول";

    const nameEditor = createProductNameEditor(product);
    const imageEditor = createProductImageEditor(product);

    const description = document.createElement("p");
    description.textContent =
      product.description || "توضیحاتی ثبت نشده است.";

    const original = document.createElement("p");
    original.textContent =
      "قیمت اصلی: " + formatPrice(getOriginalPrice(product));

    const final = document.createElement("p");
    final.textContent =
      "قیمت نهایی: " + formatPrice(getFinalPrice(product));

    const sale = getSalePrice(product);

    const discountInfo = document.createElement("p");

    if (sale !== null) {
      discountInfo.textContent =
        "🎉 تخفیف فعال: " +
        calculateDiscountPercent(getOriginalPrice(product), sale) +
        " درصد";

      discountInfo.style.color = "#287b52";
      discountInfo.style.fontWeight = "bold";
    } else {
      discountInfo.textContent = "بدون تخفیف";
    }

    const categoryLabel = document.createElement("label");
    categoryLabel.textContent = "دسته‌بندی محصول";

    const select = document.createElement("select");
    select.className = "product-category-select";

    const none = document.createElement("option");
    none.value = "";
    none.textContent = "بدون دسته‌بندی";
    select.appendChild(none);

    categories.forEach(category => {
      const option = document.createElement("option");
      option.value = String(category.id);
      option.textContent = category.name;
      select.appendChild(option);
    });

    select.value = product.category_id
      ? String(product.category_id)
      : "";

    const saveCategory = document.createElement("button");
    saveCategory.textContent = "ذخیره دسته‌بندی";

    saveCategory.addEventListener("click", () => {
      updateProductCategory(product.id, select.value, saveCategory);
    });

    const descriptionEditor =
      createProductDescriptionEditor(product);

    const priceEditor =
      createProductPriceEditor(product);

    const deleteButton = document.createElement("button");
    deleteButton.className = "danger";
    deleteButton.textContent = "حذف محصول";

    deleteButton.addEventListener("click", () => {
      deleteProduct(product.id);
    });

    item.append(
      title,
      nameEditor,
      imageEditor,
      description,
      descriptionEditor,
      original,
      final,
      discountInfo,
      categoryLabel,
      select,
      saveCategory,
      priceEditor,
      deleteButton
    );

    list.appendChild(item);
  });
}

async function updateProductCategory(productId, categoryValue, button) {
  button.disabled = true;

  const categoryId = categoryValue ? Number(categoryValue) : null;

  if (
    categoryId !== null &&
    !categories.some(c => Number(c.id) === categoryId)
  ) {
    alert("دسته‌بندی انتخاب‌شده معتبر نیست.");
    button.disabled = false;
    return;
  }

  const { error } = await db.from("products")
    .update({ category_id: categoryId })
    .eq("id", productId);

  button.disabled = false;

  if (error) {
    alert("ذخیره دسته‌بندی ناموفق بود: " + error.message);
    return;
  }

  await loadProducts();
  alert("دسته‌بندی محصول ذخیره شد.");
}

async function deleteProduct(id) {
  if (!confirm("آیا از حذف این محصول مطمئنی؟")) return;

  const { error } = await db.from("products")
    .delete()
    .eq("id", id);

  if (error) {
    alert("حذف محصول ناموفق بود: " + error.message);
    return;
  }

  await loadProducts();
  await loadDashboardStats();
}

/* نظرات */

async function loadReviews() {
  const container = $("reviews");
  if (!container) return;

  const { data, error } = await db.from("reviews")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.textContent = "دریافت نظرات ناموفق بود: " + error.message;
    return;
  }

  container.innerHTML = "";

  if (!data?.length) {
    container.textContent = "هنوز نظری ثبت نشده است.";
    return;
  }

  data.forEach(review => {
    const item = document.createElement("div");
    item.className = "review-item";

    const product = products.find(
      p => String(p.id) === String(review.product_id)
    );

    const title = document.createElement("h3");
    title.textContent =
      product?.name || "محصول شماره " + review.product_id;

    const name = document.createElement("p");
    name.textContent =
      "نام مشتری: " + (review.display_name || "ثبت نشده");

    const rating = Math.max(
      0,
      Math.min(5, Number(review.rating) || 0)
    );

    const stars = document.createElement("div");
    stars.className = "review-stars";
    stars.textContent =
      "★".repeat(rating) + "☆".repeat(5 - rating);

    const comment = document.createElement("p");
    comment.textContent = "نظر: " + (review.comment || "");

    const date = document.createElement("small");
    date.textContent = review.created_at
      ? new Date(review.created_at).toLocaleString("fa-IR")
      : "";

    const status = document.createElement("p");
    status.className = review.is_approved
      ? "review-approved"
      : "review-pending";

    status.textContent = review.is_approved
      ? "وضعیت: تأیید شده و نمایش داده شده"
      : "وضعیت: در انتظار تأیید";

    const approve = document.createElement("button");
    approve.textContent = review.is_approved
      ? "تأیید شده"
      : "تأیید نظر";

    approve.disabled = Boolean(review.is_approved);

    approve.addEventListener("click", () => {
      approveReview(review.id, approve);
    });

    const remove = document.createElement("button");
    remove.className = "danger";
    remove.textContent = "حذف نظر";

    remove.addEventListener("click", () => {
      deleteReview(review.id);
    });

    item.append(title, name, stars, comment, date, status, approve, remove);
    container.appendChild(item);
  });
}

async function approveReview(id, button) {
  button.disabled = true;

  const { error } = await db.from("reviews")
    .update({ is_approved: true })
    .eq("id", id);

  if (error) {
    alert("تأیید نظر ناموفق بود: " + error.message);
    button.disabled = false;
    return;
  }

  await loadReviews();
  await loadDashboardStats();

  alert("نظر تأیید شد و در سایت نمایش داده می‌شود.");
}

async function deleteReview(id) {
  if (!confirm("این نظر حذف شود؟")) return;

  const { error } = await db.from("reviews")
    .delete()
    .eq("id", id);

  if (error) {
    alert("حذف نظر ناموفق بود: " + error.message);
    return;
  }

  await loadReviews();
  await loadDashboardStats();

  alert("نظر حذف شد.");
}

/* سفارش‌ها */

async function loadOrders() {
  const container = $("orders");
  if (!container) return;

  container.textContent = "در حال دریافت سفارش‌ها...";

  const { data, error } = await db.from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    container.textContent =
      "دریافت سفارش‌ها ناموفق بود: " + error.message;
    return;
  }

  container.innerHTML = "";

  if (!data?.length) {
    container.textContent = "هنوز سفارشی ثبت نشده است.";
    return;
  }

  data.forEach(order => {
    const item = document.createElement("div");
    item.className = "order-item";

    let productsText = "اطلاعات محصولات موجود نیست.";

    if (Array.isArray(order.items)) {
      productsText = order.items.map(p =>
        escapeHTML(p.name || p.title || "محصول") +
        " × " + escapeHTML(p.quantity ?? p.count ?? 1)
      ).join("، ");
    } else if (order.items && typeof order.items === "object") {
      productsText = escapeHTML(JSON.stringify(order.items));
    }

    item.innerHTML = `
      <h3>سفارش شماره ${escapeHTML(order.id)}</h3>
      <p><strong>نام مشتری:</strong> ${escapeHTML(order.customer_name)}</p>
      <p><strong>شماره تماس:</strong> ${escapeHTML(order.phone)}</p>
      <p><strong>آدرس:</strong> ${escapeHTML(order.address)}</p>
      <p><strong>کد پستی:</strong> ${escapeHTML(order.postal_code || "ثبت نشده")}</p>
      <p><strong>محصولات:</strong> ${productsText}</p>
      <p><strong>مبلغ کل:</strong> ${formatPrice(order.total)}</p>
      <label>وضعیت سفارش</label>
      <select class="status-select">
        <option value="در انتظار بررسی">در انتظار بررسی</option>
        <option value="تأیید شده">تأیید شده</option>
        <option value="در حال آماده‌سازی">در حال آماده‌سازی</option>
        <option value="ارسال شده">ارسال شده</option>
        <option value="تحویل داده شده">تحویل داده شده</option>
        <option value="لغو شده">لغو شده</option>
      </select>
      <button class="save-status">ذخیره وضعیت</button>
    `;

    const select = item.querySelector(".status-select");
    select.value = order.status || "در انتظار بررسی";

    item.querySelector(".save-status").addEventListener("click", () => {
      updateOrderStatus(order.id, select.value);
    });

    const reject = document.createElement("button");
    reject.className = "danger";
    reject.textContent = "رد سفارش";
    reject.disabled = order.status === "لغو شده";

    reject.addEventListener("click", async () => {
      if (!confirm("این سفارش رد شود؟")) return;
      await updateOrderStatus(order.id, "لغو شده");
    });

    item.appendChild(reject);
    container.appendChild(item);
  });
}

async function updateOrderStatus(id, status) {
  const { error } = await db.from("orders")
    .update({ status })
    .eq("id", id);

  if (error) {
    alert("تغییر وضعیت ناموفق بود: " + error.message);
    return;
  }

  alert(status === "لغو شده"
    ? "سفارش رد شد."
    : "وضعیت سفارش ذخیره شد.");

  await loadOrders();
  await loadDashboardStats();
}

/* کدهای تخفیف */

async function loadDiscounts() {
  const list = $("discountList");
  if (!list) return;

  list.textContent = "در حال دریافت کدهای تخفیف...";

  const [codes, redemptions] = await Promise.all([
    db.from("discount_codes")
      .select("*")
      .order("created_at", { ascending: false }),

    db.from("discount_redemptions")
      .select("discount_code_id, customer_phone, used_at")
  ]);

  if (codes.error) {
    list.textContent =
      "دریافت کدهای تخفیف ناموفق بود: " + codes.error.message;
    return;
  }

  if (redemptions.error) {
    list.textContent =
      "دریافت آمار استفاده ناموفق بود: " + redemptions.error.message;
    return;
  }

  discounts = codes.data || [];
  discountRedemptions = redemptions.data || [];

  renderDiscounts();
}

function getDiscountStats(id) {
  const records = discountRedemptions.filter(
    r => String(r.discount_code_id) === String(id)
  );

  return {
    uses: records.length,
    customers: new Set(
      records
        .map(r => String(r.customer_phone || "").trim())
        .filter(Boolean)
    ).size
  };
}

function renderDiscounts() {
  const list = $("discountList");
  if (!list) return;

  list.innerHTML = "";

  if (!discounts.length) {
    list.textContent = "هنوز کد تخفیفی ساخته نشده است.";
    return;
  }

  discounts.forEach(discount => {
    const item = document.createElement("div");
    item.className = "discount-item";

    const stats = getDiscountStats(discount.id);

    const title = document.createElement("h3");
    title.textContent = "🎟️ " + discount.code;

    const status = document.createElement("p");
    status.className = "discount-status " +
      (discount.is_active ? "active-status" : "inactive-status");

    status.textContent = discount.is_active
      ? "وضعیت: فعال"
      : "وضعیت: غیرفعال";

    const typeText = discount.discount_type === "percent"
      ? Number(discount.discount_value) + " درصد"
      : formatPrice(discount.discount_value);

    const details = document.createElement("div");

    details.innerHTML = `
      <p><strong>مقدار تخفیف:</strong> ${escapeHTML(typeText)}</p>
      <p><strong>حداقل سفارش:</strong> ${escapeHTML(formatPrice(discount.min_order))}</p>
      <p><strong>مشتریان استفاده‌کننده:</strong>
      ${stats.customers.toLocaleString("fa-IR")} از
      ${discount.max_customers == null ? "نامحدود" : escapeHTML(discount.max_customers)}</p>
      <p><strong>دفعات استفاده:</strong>
      ${stats.uses.toLocaleString("fa-IR")} از
      ${discount.max_uses == null ? "نامحدود" : escapeHTML(discount.max_uses)}</p>
      <p><strong>حد استفاده هر مشتری:</strong>
      ${Number(discount.per_user_limit || 1).toLocaleString("fa-IR")}</p>
      <p><strong>شروع:</strong> ${escapeHTML(formatDate(discount.starts_at))}</p>
      <p><strong>پایان:</strong> ${escapeHTML(formatDate(discount.expires_at))}</p>
    `;

    const edit = document.createElement("button");
    edit.className = "secondary";
    edit.textContent = "ویرایش کد";
    edit.addEventListener("click", () => editDiscount(discount));

    const toggle = document.createElement("button");
    toggle.textContent = discount.is_active
      ? "غیرفعال کردن"
      : "فعال کردن";

    toggle.addEventListener("click", () => toggleDiscount(discount));

    const remove = document.createElement("button");
    remove.className = "danger";
    remove.textContent = "حذف کد";
    remove.addEventListener("click", () => deleteDiscount(discount));

    item.append(title, status, details, edit, toggle, remove);
    list.appendChild(item);
  });
}

function resetDiscountForm() {
  $("discountForm").reset();
  $("discountId").value = "";
  $("discountType").value = "percent";
  $("discountMinOrder").value = "0";
  $("discountPerUserLimit").value = "1";
  $("discountActive").value = "true";
  $("discountSubmitButton").textContent = "ثبت کد تخفیف";

  hideMessage("discountMessage");
}

$("discountCancelButton").addEventListener("click", resetDiscountForm);

$("discountType").addEventListener("change", () => {
  const input = $("discountValue");

  if ($("discountType").value === "percent") {
    input.max = "100";
    input.placeholder = "مثلاً ۲۰";
  } else {
    input.removeAttribute("max");
    input.placeholder = "مبلغ تخفیف به تومان";
  }
});

$("discountForm").addEventListener("submit", async event => {
  event.preventDefault();
  hideMessage("discountMessage");

  const id = $("discountId").value;
  const code = $("discountCode").value.trim().toUpperCase();
  const type = $("discountType").value;
  const value = Number($("discountValue").value);
  const minOrder = Number($("discountMinOrder").value || 0);

  const maxCustomersText = $("discountMaxCustomers").value.trim();
  const maxUsesText = $("discountMaxUses").value.trim();

  const perUserLimit = Number($("discountPerUserLimit").value);
  const startsInput = $("discountStartsAt").value;
  const expiresInput = $("discountExpiresAt").value;
  const isActive = $("discountActive").value === "true";

  if (!code || !Number.isFinite(value) || value <= 0) {
    showMessage("discountMessage", "کد تخفیف و مقدار معتبر وارد کن.");
    return;
  }

  if (type === "percent" && value > 100) {
    showMessage(
      "discountMessage",
      "درصد تخفیف نمی‌تواند بیشتر از ۱۰۰ باشد."
    );
    return;
  }

  if (!Number.isFinite(minOrder) || minOrder < 0) {
    showMessage("discountMessage", "حداقل مبلغ سفارش معتبر نیست.");
    return;
  }

  if (!Number.isInteger(perUserLimit) || perUserLimit < 1) {
    showMessage(
      "discountMessage",
      "تعداد استفاده هر مشتری باید حداقل ۱ باشد."
    );
    return;
  }

  const maxCustomers = maxCustomersText === ""
    ? null
    : Number(maxCustomersText);

  const maxUses = maxUsesText === ""
    ? null
    : Number(maxUsesText);

  if (
    maxCustomers !== null &&
    (!Number.isInteger(maxCustomers) || maxCustomers < 1)
  ) {
    showMessage("discountMessage", "تعداد مشتریان باید عدد صحیح مثبت باشد.");
    return;
  }

  if (
    maxUses !== null &&
    (!Number.isInteger(maxUses) || maxUses < 1)
  ) {
    showMessage("discountMessage", "تعداد کل استفاده باید عدد صحیح مثبت باشد.");
    return;
  }

  let startsAt = null;
  let expiresAt = null;

  try {
    startsAt = startsInput
      ? new Date(startsInput).toISOString()
      : null;

    expiresAt = expiresInput
      ? new Date(expiresInput).toISOString()
      : null;

  } catch {
    showMessage("discountMessage", "تاریخ واردشده معتبر نیست.");
    return;
  }

  if (
    startsAt &&
    expiresAt &&
    new Date(startsAt) >= new Date(expiresAt)
  ) {
    showMessage(
      "discountMessage",
      "تاریخ پایان باید بعد از تاریخ شروع باشد."
    );
    return;
  }

  const payload = {
    code,
    discount_type: type,
    discount_value: value,
    min_order: minOrder,
    max_customers: maxCustomers,
    max_uses: maxUses,
    per_user_limit: perUserLimit,
    starts_at: startsAt,
    expires_at: expiresAt,
    is_active: isActive
  };

  const button = $("discountSubmitButton");
  button.disabled = true;

  try {
    const result = id
      ? await db.from("discount_codes").update(payload).eq("id", id)
      : await db.from("discount_codes").insert([payload]);

    if (result.error) {
      showMessage(
        "discountMessage",
        "ذخیره کد تخفیف ناموفق بود: " + result.error.message
      );
      return;
    }

    resetDiscountForm();

    showMessage(
      "discountMessage",
      id
        ? "کد تخفیف با موفقیت ویرایش شد."
        : "کد تخفیف با موفقیت ساخته شد."
    );

    await loadDiscounts();

  } catch (error) {
    showMessage(
      "discountMessage",
      "خطای غیرمنتظره: " + error.message
    );

  } finally {
    button.disabled = false;
  }
});

function editDiscount(discount) {
  $("discountId").value = discount.id;
  $("discountCode").value = discount.code || "";
  $("discountType").value = discount.discount_type || "percent";
  $("discountValue").value = discount.discount_value ?? "";
  $("discountMinOrder").value = discount.min_order ?? 0;
  $("discountMaxCustomers").value = discount.max_customers ?? "";
  $("discountMaxUses").value = discount.max_uses ?? "";
  $("discountPerUserLimit").value = discount.per_user_limit ?? 1;
  $("discountStartsAt").value = toLocalDateTime(discount.starts_at);
  $("discountExpiresAt").value = toLocalDateTime(discount.expires_at);
  $("discountActive").value = discount.is_active ? "true" : "false";

  $("discountSubmitButton").textContent = "ذخیره تغییرات";
  $("discountType").dispatchEvent(new Event("change"));

  showMessage("discountMessage", "در حال ویرایش کد: " + discount.code);

  $("discountForm").scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

async function toggleDiscount(discount) {
  const newStatus = !discount.is_active;

  const { error } = await db.from("discount_codes")
    .update({ is_active: newStatus })
    .eq("id", discount.id);

  if (error) {
    alert("تغییر وضعیت ناموفق بود: " + error.message);
    return;
  }

  await loadDiscounts();

  alert(newStatus
    ? "کد تخفیف فعال شد."
    : "کد تخفیف غیرفعال شد.");
}

async function deleteDiscount(discount) {
  if (!confirm(
    "کد تخفیف «" + discount.code +
    "» حذف شود؟ سوابق استفاده مرتبط نیز حذف خواهند شد."
  )) return;

  const { error } = await db.from("discount_codes")
    .delete()
    .eq("id", discount.id);

  if (error) {
    alert("حذف کد تخفیف ناموفق بود: " + error.message);
    return;
  }

  resetDiscountForm();
  await loadDiscounts();

  alert("کد تخفیف حذف شد.");
}

/* =====================================================
   سیستم یکپارچه اتورفرش و Supabase Realtime
===================================================== */

/* بررسی فعال بودن پنل */

function isAdminPanelActive() {
  const panel = $("adminPanel");

  return Boolean(
    adminIsActive &&
    panel &&
    !panel.classList.contains("hidden")
  );
}

/* توقف کامل سیستم به‌روزرسانی */

async function stopAdminLiveUpdates() {
  adminIsActive = false;
  adminSessionVersion++;

  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }

  if (realtimeRefreshTimer) {
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = null;
  }

  refreshPending = false;

  const channels = [...adminChannels];

  adminChannels = [];
  realtimeStarted = false;

  for (const channel of channels) {
    try {
      await db.removeChannel(channel);
    } catch (error) {
      console.warn("خطا در بستن کانال Realtime:", error);
    }
  }
}

/* دریافت دوباره اطلاعات تمام بخش‌ها */

async function refreshAllAdminData() {
  if (!isAdminPanelActive()) return;

  if (refreshRunning) {
    refreshPending = true;
    return;
  }

  refreshRunning = true;

  const currentVersion = adminSessionVersion;

  try {
    do {
      refreshPending = false;

      if (
        !isAdminPanelActive() ||
        currentVersion !== adminSessionVersion
      ) {
        break;
      }

      await Promise.all([
        loadSettings(),
        loadCategories(),
        loadProducts()
      ]);

      if (
        !isAdminPanelActive() ||
        currentVersion !== adminSessionVersion
      ) {
        break;
      }

      await Promise.all([
        loadOrders(),
        loadReviews(),
        loadDiscounts(),
        loadDashboardStats()
      ]);

    } while (
      refreshPending &&
      isAdminPanelActive() &&
      currentVersion === adminSessionVersion
    );

  } catch (error) {
    console.error("خطا در به‌روزرسانی پنل:", error);

  } finally {
    refreshRunning = false;

    if (
      refreshPending &&
      isAdminPanelActive() &&
      currentVersion === adminSessionVersion
    ) {
      refreshPending = false;
      scheduleAdminRefresh();
    }
  }
}

/* زمان‌بندی به‌روزرسانی */

function scheduleAdminRefresh() {
  if (!isAdminPanelActive()) return;

  if (realtimeRefreshTimer) {
    clearTimeout(realtimeRefreshTimer);
  }

  realtimeRefreshTimer = setTimeout(() => {
    realtimeRefreshTimer = null;

    if (!isAdminPanelActive()) return;

    refreshAllAdminData();

  }, 500);
}

/* اتورفرش دوره‌ای هر ۱۰ ثانیه */

function startAutoRefresh() {
  if (!isAdminPanelActive()) return;

  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
  }

  autoRefreshTimer = setInterval(() => {
    if (!isAdminPanelActive()) return;

    refreshAllAdminData();

  }, 10000);
}

/* ساخت کانال Realtime برای یک جدول */

function createAdminRealtimeChannel(table) {
  const channel = db
    .channel("admin-live-" + table)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table
      },
      () => {
        if (!isAdminPanelActive()) return;

        scheduleAdminRefresh();
      }
    )
    .subscribe(status => {
      if (status === "CHANNEL_ERROR") {
        console.warn("خطا در اتصال Realtime جدول:", table);
      }

      if (status === "TIMED_OUT") {
        console.warn("اتصال Realtime با وقفه مواجه شد:", table);
      }
    });

  adminChannels.push(channel);

  return channel;
}

/* راه‌اندازی تمام کانال‌های Realtime */

function setupAdminRealtime() {
  if (!isAdminPanelActive()) return;
  if (realtimeStarted) return;

  realtimeStarted = true;

  const tables = [
    "products",
    "categories",
    "store_settings",
    "orders",
    "reviews",
    "discount_codes",
    "discount_redemptions"
  ];

  tables.forEach(table => {
    createAdminRealtimeChannel(table);
  });
}

/* ورود به پنل مدیریت */

async function showAdmin() {
  adminSessionVersion++;
  adminIsActive = true;

  $("loginSection").classList.add("hidden");
  $("adminPanel").classList.remove("hidden");

  addSaleFieldsToAddForm();
  createDashboardStats();

  await refreshAllAdminData();

  if (!isAdminPanelActive()) return;

  setupAdminRealtime();
  startAutoRefresh();
}

/* خروج و نمایش صفحه ورود */

async function showLogin() {
  await stopAdminLiveUpdates();

  $("loginSection").classList.remove("hidden");
  $("adminPanel").classList.add("hidden");
}

/* بررسی ورود مدیر */

async function checkAdmin() {
  const { data, error } = await db.auth.getSession();

  if (error || !data.session) {
    await showLogin();
    return;
  }

  if (data.session.user.id !== ADMIN_UID) {
    await db.auth.signOut();
    await showLogin();

    showMessage(
      "loginMessage",
      "این حساب اجازه ورود به پنل مدیریت را ندارد."
    );

    return;
  }

  await showAdmin();
}

/* فرم ورود */

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  hideMessage("loginMessage");

  const { data, error } = await db.auth.signInWithPassword({
    email: $("loginEmail").value.trim(),
    password: $("loginPassword").value
  });

  if (error) {
    showMessage("loginMessage", "ورود ناموفق بود: " + error.message);
    return;
  }

  if (!data.user || data.user.id !== ADMIN_UID) {
    await db.auth.signOut();

    showMessage(
      "loginMessage",
      "این حساب مدیر فروشگاه نیست."
    );

    return;
  }

  await showAdmin();
});

/* خروج مدیر */

$("logoutButton").addEventListener("click", async () => {
  await db.auth.signOut();
  await showLogin();
});

/* مدیریت تغییر وضعیت احراز هویت */

db.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) {
    showLogin();
  }
});

/* شروع پنل */

checkAdmin();
