
const SUPABASE_URL = "https://mubrlmoypxlysysbaccs.supabase.co";
const SUPABASE_KEY = "sb_publishable_EpUr-dPOOmMqEM1LYb5rKQ_VrwyVAAA";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let cart = [];
let cartMessageTimer = null;
let productColumns = 2;
let allProducts = [];
let allCategories = [];
let selectedProduct = null;
let productReviewStats = {};
let productSort = "newest";

let appliedDiscountCode = "";
let discountPreview = null;
let discountRequestNumber = 0;
let refreshRunning = false;

/* ابزارهای عمومی */

function normalizeDigits(value) {
  return String(value)
    .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function normalizeSearchText(value) {
  return String(value || "").toLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u200c/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPrice(value) {
  return (Number(value) || 0).toLocaleString("en-US") + " تومان";
}

function getCleanPhone(value) {
  return normalizeDigits(value || "").replace(/\D/g, "");
}

/* محاسبه قیمت اصلی و تخفیف محصول */

function getProductPricing(product) {
  const currentPrice = Number(product.price) || 0;
  const originalPrice = Number(product.original_price) || currentPrice;
  const salePrice = Number(product.sale_price);

  const hasSale =
    product.sale_active === true &&
    product.sale_price !== null &&
    product.sale_price !== undefined &&
    Number.isFinite(salePrice) &&
    salePrice >= 0 &&
    salePrice < originalPrice;

  return {
    originalPrice,
    finalPrice: hasSale ? salePrice : currentPrice,
    hasSale
  };
}

function createPriceElement(product, detail = false) {
  const pricing = getProductPricing(product);

  const container = document.createElement("div");
  container.className = detail
    ? "product-detail-price-box"
    : "product-price-box";

  if (pricing.hasSale) {
    const original = document.createElement("span");
    original.className = "product-original-price";
    original.textContent = formatPrice(pricing.originalPrice);

    const finalPrice = document.createElement("strong");
    finalPrice.className = "product-sale-price";
    finalPrice.textContent = formatPrice(pricing.finalPrice);

    const percent = Math.round(
      ((pricing.originalPrice - pricing.finalPrice) /
        pricing.originalPrice) * 100
    );

    const badge = document.createElement("span");
    badge.className = "product-discount-percent";
    badge.textContent = percent.toLocaleString("en-US") + "% تخفیف";

    container.append(original, finalPrice, badge);
  } else {
    const price = document.createElement("strong");
    price.className = detail
      ? "product-detail-price"
      : "product-price";

    price.textContent = formatPrice(pricing.finalPrice);
    container.appendChild(price);
  }

  return container;
}

function getCartSubtotal() {
  return cart.reduce((sum, item) => {
    return sum + getProductPricing(item).finalPrice * item.quantity;
  }, 0);
}

function getCartPayload() {
  return cart.map(item => ({
    product_id: item.id,
    quantity: item.quantity
  }));
}

function getRpcRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

function showCartMessage(message) {
  let box = document.getElementById("cartMessage");

  if (!box) {
    box = document.createElement("div");
    box.id = "cartMessage";

    Object.assign(box.style, {
      position: "fixed",
      top: "20px",
      left: "50%",
      transform: "translateX(-50%)",
      width: "max-content",
      maxWidth: "90%",
      background: "#796655",
      color: "white",
      padding: "15px 22px",
      borderRadius: "12px",
      boxShadow: "0 5px 20px rgba(0,0,0,0.2)",
      zIndex: "999999",
      textAlign: "center",
      fontFamily: "Tahoma, sans-serif",
      fontSize: "14px",
      display: "none"
    });

    document.body.appendChild(box);
  }

  box.textContent = message;
  box.style.display = "block";

  clearTimeout(cartMessageTimer);

  cartMessageTimer = setTimeout(() => {
    box.style.display = "none";
  }, 2500);
}

/* طراحی محصولات */

function setupProductCardStyles() {
  if (document.getElementById("product-card-design")) return;

  const style = document.createElement("style");
  style.id = "product-card-design";

  style.textContent = `
    .products .product {
      background: #fffdf9;
      border: 1px solid #eee4d9;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 5px 18px rgba(90,65,45,.07);
      transition: transform .25s ease, box-shadow .25s ease;
      min-width: 0;
      display: flex;
      flex-direction: column;
      cursor: pointer;
    }

    .products .product:hover {
      transform: translateY(-5px);
      box-shadow: 0 12px 28px rgba(90,65,45,.13);
    }

    .products .product-image-box {
      width: 100%;
      aspect-ratio: 1 / 1;
      background: #f4eee7;
      overflow: hidden;
      position: relative;
    }

    .products .product-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform .4s ease;
    }

    .products .product:hover .product-image {
      transform: scale(1.04);
    }

    .products .product-placeholder {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #927c68;
      font-size: 22px;
      font-weight: bold;
    }

    .product-special-badges {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      pointer-events: none;
    }

    .product-special-badge {
      padding: 7px 11px;
      border-radius: 20px;
      font-family: Tahoma, sans-serif;
      font-size: 11px;
      font-weight: bold;
      box-shadow: 0 3px 10px rgba(0,0,0,.13);
      direction: rtl;
    }

    .product-special-badge.popular {
      background: #594331;
      color: #fffaf2;
    }

    .product-special-badge.top-rated {
      background: #e6d2ae;
      color: #493521;
    }

    .products .product-info {
      padding: 16px;
      display: flex;
      flex-direction: column;
      flex: 1;
      gap: 9px;
    }

    .products .product-title {
      color: #49382c;
      font-size: 17px;
      font-weight: 800;
      line-height: 1.8;
      margin: 0;
    }

    .products .product-category {
      display: inline-flex;
      width: fit-content;
      background: #f2eae1;
      color: #806750;
      padding: 5px 11px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: bold;
    }

    .products .product-rating {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      direction: rtl;
      font-size: 12px;
      color: #8b7968;
      min-height: 20px;
    }

    .products .product-rating-stars {
      color: #c49b54;
      font-size: 16px;
      letter-spacing: 1px;
    }

    .products .product-rating-average {
      color: #594331;
      font-weight: 900;
    }

    .products .product-rating-count {
      color: #988879;
      font-size: 11px;
    }

    .products .product-description {
      display: block !important;
      visibility: visible !important;
      color: #756354 !important;
      font-size: 13px;
      line-height: 2;
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      min-height: 25px;
      flex: 1;
    }

    .products .product-bottom {
      display: flex;
      flex-direction: column;
      gap: 11px;
      margin-top: 8px;
      padding-top: 12px;
      border-top: 1px solid #eee5dc;
    }

    .products .product-price {
      color: #634b38;
      font-size: 16px;
      font-weight: 900;
    }

    .product-price-box,
    .product-detail-price-box {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      direction: rtl;
    }

    .product-original-price {
      color: #9b8b7c;
      font-size: 12px;
      text-decoration: line-through;
      text-decoration-thickness: 1.5px;
      font-weight: normal;
    }

    .product-sale-price {
      color: #a33f32;
      font-size: 17px;
      font-weight: 900;
    }

    .product-discount-percent {
      background: #f4e5df;
      color: #a33f32;
      border-radius: 20px;
      padding: 4px 8px;
      font-size: 11px;
      font-weight: bold;
    }

    .product-detail-price-box {
      margin: 15px 0;
    }

    .product-detail-price-box .product-original-price {
      font-size: 15px;
    }

    .product-detail-price-box .product-sale-price {
      font-size: 22px;
    }

    .products .product-add-button {
      width: 100%;
      border: none;
      border-radius: 11px;
      padding: 12px 10px;
      background: #796655;
      color: white;
      font-family: inherit;
      font-size: 13px;
      font-weight: bold;
      cursor: pointer;
      transition: background .2s ease;
    }

    .products .product-add-button:hover {
      background: #594332;
    }

    .product-detail-description {
      display: block !important;
      visibility: visible !important;
      color: #756354 !important;
      line-height: 2.2;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      margin: 15px 0;
      font-size: 14px;
    }

    .product-sort-box {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      margin: 18px 0;
      padding: 14px 16px;
      background: #fffdf9;
      border: 1px solid #eee4d9;
      border-radius: 14px;
    }

    .product-sort-label {
      color: #594331;
      font-size: 13px;
      font-weight: 800;
    }

    .product-sort-select {
      min-width: 190px;
      max-width: 100%;
      padding: 10px 13px;
      border: 1px solid #dfd1c2;
      border-radius: 10px;
      background: #f8f5ef;
      color: #594331;
      font-family: inherit;
      font-size: 13px;
      outline: none;
      cursor: pointer;
    }

    .discount-box {
      margin: 20px 0;
      padding: 18px;
      background: #faf6ef;
      border: 1px solid #e8ddce;
      border-radius: 15px;
    }

    .discount-title {
      color: #594331;
      font-size: 16px;
      font-weight: 900;
      margin: 0 0 13px;
    }

    .discount-input-row {
      display: flex;
      gap: 9px;
      flex-wrap: wrap;
    }

    .discount-input {
      flex: 1;
      min-width: 150px;
      padding: 12px;
      border: 1px solid #d9cabb;
      border-radius: 10px;
      background: white;
      color: #49382c;
      font-family: inherit;
      font-size: 14px;
      outline: none;
      direction: ltr;
      text-align: left;
    }

    .discount-input:focus {
      border-color: #796655;
    }

    .discount-apply-button {
      border: none;
      border-radius: 10px;
      padding: 12px 18px;
      background: #796655;
      color: white;
      font-family: inherit;
      font-weight: bold;
      cursor: pointer;
    }

    .discount-apply-button:disabled {
      opacity: .6;
      cursor: wait;
    }

    .discount-message {
      margin: 12px 0 0;
      font-size: 13px;
      line-height: 1.8;
    }

    .discount-summary {
      display: none;
      margin-top: 15px;
      padding-top: 13px;
      border-top: 1px solid #e5d9ca;
    }

    .discount-summary-row {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin: 9px 0;
      color: #705c49;
      font-size: 14px;
    }

    .discount-summary-row.final {
      color: #315f43;
      font-weight: 900;
      font-size: 17px;
    }

    .discount-remove {
      display: none;
      margin-top: 10px;
      border: none;
      background: transparent;
      color: #a34b42;
      font-family: inherit;
      cursor: pointer;
      font-size: 12px;
      font-weight: bold;
    }

    @media(max-width:480px) {
      .products .product-info {
        padding: 12px;
      }

      .products .product-title {
        font-size: 15px;
      }

      .products .product-price {
        font-size: 14px;
      }

      .products .product-add-button {
        font-size: 12px;
        padding: 10px 7px;
      }

      .product-sort-box {
        align-items: stretch;
        flex-direction: column;
      }

      .product-sort-select {
        width: 100%;
      }

      .discount-input-row {
        flex-direction: column;
      }

      .discount-apply-button {
        width: 100%;
      }
    }
  `;

  document.head.appendChild(style);
}

/* ساخت بخش کد تخفیف */

function setupDiscountBox() {
  const cartSection = document.getElementById("cart");
  if (!cartSection) return;

  if (document.getElementById("discountBox")) return;

  const box = document.createElement("div");
  box.id = "discountBox";
  box.className = "discount-box";

  box.innerHTML = `
    <h3 class="discount-title">🎁 کد تخفیف دارید؟</h3>

    <div class="discount-input-row">
      <input
        id="discountCodeInput"
        class="discount-input"
        type="text"
        placeholder="کد تخفیف را وارد کنید"
        autocomplete="off"
      >

      <button
        id="applyDiscountButton"
        class="discount-apply-button"
        type="button"
      >
        بررسی کد
      </button>
    </div>

    <p id="discountMessage" class="discount-message"></p>

    <div id="discountSummary" class="discount-summary">
      <div class="discount-summary-row">
        <span>مبلغ اولیه:</span>
        <strong id="discountSubtotal">0 تومان</strong>
      </div>

      <div class="discount-summary-row">
        <span>درصد تخفیف:</span>
        <strong id="discountPercent">0%</strong>
      </div>

      <div class="discount-summary-row">
        <span>میزان تخفیف:</span>
        <strong id="discountAmount">0 تومان</strong>
      </div>

      <div class="discount-summary-row final">
        <span>مبلغ نهایی:</span>
        <strong id="finalTotal">0 تومان</strong>
      </div>
    </div>

    <button
      id="removeDiscountButton"
      class="discount-remove"
      type="button"
    >
      حذف کد تخفیف
    </button>
  `;

  const totalHeading = cartSection.querySelector("h3");

  if (totalHeading) {
    totalHeading.insertAdjacentElement("afterend", box);
  } else {
    cartSection.appendChild(box);
  }

  document.getElementById("applyDiscountButton")
    .addEventListener("click", applyDiscount);

  document.getElementById("removeDiscountButton")
    .addEventListener("click", removeDiscount);

  const input = document.getElementById("discountCodeInput");

  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyDiscount();
    }
  });

  input.addEventListener("input", () => {
    if (
      appliedDiscountCode &&
      input.value.trim().toUpperCase() !== appliedDiscountCode
    ) {
      clearDiscountPreview(
        "برای استفاده از کد جدید، دوباره آن را بررسی کنید."
      );
    }
  });
}

function showDiscountMessage(message, success = false) {
  const element = document.getElementById("discountMessage");
  if (!element) return;

  element.textContent = message;
  element.style.color = success ? "#26734d" : "#a34b42";
}

function clearDiscountPreview(message = "", cancelPending = true) {
  if (cancelPending) {
    discountRequestNumber++;
  }

  appliedDiscountCode = "";
  discountPreview = null;

  const summary = document.getElementById("discountSummary");
  const removeButton = document.getElementById("removeDiscountButton");
  const applyButton = document.getElementById("applyDiscountButton");

  if (summary) summary.style.display = "none";
  if (removeButton) removeButton.style.display = "none";

  if (applyButton) {
    applyButton.disabled = false;
    applyButton.textContent = "بررسی کد";
  }

  if (message) showDiscountMessage(message);

  updateDiscountSummary();
}

function updateDiscountSummary() {
  const summary = document.getElementById("discountSummary");
  if (!summary) return;

  if (!discountPreview || !appliedDiscountCode) {
    summary.style.display = "none";
    return;
  }

  const subtotal = Number(discountPreview.subtotal) || 0;
  const discount = Number(discountPreview.discount_amount) || 0;
  const finalTotal = Number(discountPreview.final_total) || 0;

  const discountPercent = subtotal > 0
    ? (discount / subtotal) * 100
    : 0;

  document.getElementById("discountSubtotal").textContent =
    formatPrice(subtotal);

  document.getElementById("discountAmount").textContent =
    formatPrice(discount);

  document.getElementById("finalTotal").textContent =
    formatPrice(finalTotal);

  const percentElement = document.getElementById("discountPercent");

  if (percentElement) {
    percentElement.textContent =
      Number(discountPercent.toFixed(2)).toString() + "%";
  }

  summary.style.display = "block";

  const removeButton = document.getElementById("removeDiscountButton");
  if (removeButton) removeButton.style.display = "inline-block";
}

/* بررسی کد تخفیف در سرور */

async function checkDiscountCode(code, phone, showMessage = true) {
  if (!cart.length) {
    clearDiscountPreview("ابتدا محصولی به سبد خرید اضافه کنید.");
    return false;
  }

  if (!phone || phone.length < 10 || phone.length > 15) {
    clearDiscountPreview(
      "ابتدا شماره تلفن معتبر خود را در فرم سفارش وارد کنید."
    );
    return false;
  }

  const requestNumber = ++discountRequestNumber;
  const button = document.getElementById("applyDiscountButton");

  if (button) {
    button.disabled = true;
    button.textContent = "در حال بررسی...";
  }

  let timeoutId;

  try {
    const rpcPromise = db.rpc("check_store_discount", {
      p_items: getCartPayload(),
      p_phone: phone,
      p_discount_code: code
    });

    const timeoutPromise = new Promise((resolve, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(
          "سرور در زمان مقرر پاسخ نداد. اتصال اینترنت را بررسی کنید."
        ));
      }, 15000);
    });

    const { data, error } = await Promise.race([
      rpcPromise,
      timeoutPromise
    ]);

    if (error) throw error;

    if (requestNumber !== discountRequestNumber) {
      return false;
    }

    const result = getRpcRow(data);

    if (!result) {
      throw new Error("پاسخی از سامانه تخفیف دریافت نشد.");
    }

    if (result.is_valid !== true) {
      clearDiscountPreview(
        result.message || "کد تخفیف یافت نشد.",
        false
      );

      return false;
    }

    appliedDiscountCode = code.toUpperCase();
    discountPreview = result;

    updateDiscountSummary();

    if (showMessage) {
      showDiscountMessage(
        result.message || "کد تخفیف با موفقیت اعمال شد.",
        true
      );
    }

    return true;

  } catch (error) {
    console.error("خطای بررسی کد تخفیف:", error);

    if (requestNumber === discountRequestNumber) {
      clearDiscountPreview(
        "بررسی کد تخفیف انجام نشد: " +
        (error.message || "خطای ناشناخته"),
        false
      );
    }

    return false;

  } finally {
    clearTimeout(timeoutId);

    if (requestNumber === discountRequestNumber && button) {
      button.disabled = false;
      button.textContent = "بررسی کد";
    }
  }
}

async function applyDiscount() {
  const input = document.getElementById("discountCodeInput");
  const phoneInput = document.getElementById("customerPhone");

  if (!input) return;

  const code = input.value.trim().toUpperCase();
  const phone = getCleanPhone(phoneInput ? phoneInput.value : "");

  if (!code) {
    clearDiscountPreview("لطفاً کد تخفیف را وارد کنید.");
    return;
  }

  if (!phone) {
    clearDiscountPreview(
      "ابتدا شماره تلفن خود را در فرم سفارش وارد کنید."
    );

    if (phoneInput) phoneInput.focus();
    return;
  }

  await checkDiscountCode(code, phone);
}

function removeDiscount() {
  const input = document.getElementById("discountCodeInput");

  if (input) input.value = "";

  clearDiscountPreview("کد تخفیف حذف شد.");
}

/* مرتب‌سازی */

function setupProductSort() {
  const container = document.querySelector(".products");
  if (!container) return;

  if (document.getElementById("productSortBox")) return;

  const box = document.createElement("div");
  box.id = "productSortBox";
  box.className = "product-sort-box";

  const label = document.createElement("label");
  label.className = "product-sort-label";
  label.textContent = "مرتب‌سازی محصولات:";
  label.htmlFor = "productSortSelect";

  const select = document.createElement("select");
  select.id = "productSortSelect";
  select.className = "product-sort-select";

  [
    ["newest", "جدیدترین محصولات"],
    ["rating", "بیشترین امتیاز"],
    ["popular", "محبوب‌ترین محصولات"],
    ["cheap", "ارزان‌ترین"],
    ["expensive", "گران‌ترین"]
  ].forEach(([value, text]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    select.appendChild(option);
  });

  select.value = productSort;

  select.addEventListener("change", () => {
    productSort = select.value;
    applyProductFilters();
  });

  box.append(label, select);
  container.parentNode.insertBefore(box, container);
}

function applyProductColumns() {
  const container = document.querySelector(".products");
  if (!container) return;

  const columns = Math.max(1, Math.min(6, Number(productColumns) || 2));

  container.style.gridTemplateColumns =
    `repeat(${columns}, minmax(0, 1fr))`;
}

/* دسته‌بندی */

function getProductCategory(product) {
  if (!product.category_id) return "بدون دسته‌بندی";

  const category = allCategories.find(
    item => String(item.id) === String(product.category_id)
  );

  return category ? category.name : "بدون دسته‌بندی";
}

function updateCategoryFilter() {
  const select = document.getElementById("categoryFilter");
  if (!select) return;

  const previousValue = select.value;
  select.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "همه دسته‌بندی‌ها";
  select.appendChild(allOption);

  allCategories.forEach(category => {
    const option = document.createElement("option");
    option.value = String(category.id);
    option.textContent = category.name;
    select.appendChild(option);
  });

  select.value = allCategories.some(
    item => String(item.id) === previousValue
  ) ? previousValue : "all";
}

/* دریافت امتیازها */

async function loadAllProductReviewStats() {
  try {
    const { data, error } = await db
      .from("reviews")
      .select("product_id, rating")
      .eq("is_approved", true);

    if (error) throw error;

    const stats = {};

    (data || []).forEach(review => {
      const id = String(review.product_id);

      if (!stats[id]) {
        stats[id] = {
          total: 0,
          count: 0,
          average: 0
        };
      }

      stats[id].total += Number(review.rating) || 0;
      stats[id].count++;
    });

    Object.keys(stats).forEach(id => {
      stats[id].average = stats[id].total / stats[id].count;
    });

    productReviewStats = stats;

  } catch (error) {
    console.error("خطای دریافت امتیاز محصولات:", error);
  }
}

function getProductRating(productId) {
  return productReviewStats[String(productId)] || {
    total: 0,
    count: 0,
    average: 0
  };
}

/* ساخت نشان‌های ویژه */

function createProductBadges(productId) {
  const stats = getProductRating(productId);

  const container = document.createElement("div");
  container.className = "product-special-badges";

  if (stats.count >= 3) {
    const badge = document.createElement("span");
    badge.className = "product-special-badge popular";
    badge.textContent = "🔥 محبوب";
    container.appendChild(badge);
  }

  if (stats.count >= 2 && stats.average >= 4.5) {
    const badge = document.createElement("span");
    badge.className = "product-special-badge top-rated";
    badge.textContent = "⭐ امتیاز برتر";
    container.appendChild(badge);
  }

  return container;
}

function createProductRatingElement(productId) {
  const stats = getProductRating(productId);

  const container = document.createElement("div");
  container.className = "product-rating";

  const stars = document.createElement("span");
  stars.className = "product-rating-stars";

  const average = document.createElement("span");
  average.className = "product-rating-average";

  const count = document.createElement("span");
  count.className = "product-rating-count";

  if (stats.count > 0) {
    const rounded = Math.round(stats.average);

    stars.textContent =
      "★".repeat(rounded) + "☆".repeat(5 - rounded);

    average.textContent =
      stats.average.toFixed(1) + " از 5";

    count.textContent =
      "(" + stats.count.toLocaleString("en-US") + " نظر)";
  } else {
    stars.textContent = "☆☆☆☆☆";
    average.textContent = "بدون امتیاز";
    count.textContent = "(هنوز نظری ثبت نشده)";
  }

  container.append(stars, average, count);
  return container;
}

/* دریافت اطلاعات فروشگاه */

async function displayStore() {
  const container = document.querySelector(".products");

  try {
    const { data: settings, error: settingsError } = await db
      .from("store_settings")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (settingsError) console.error(settingsError);

    if (settings) {
      const title = document.querySelector("header h1");
      const description = document.querySelector("header p");
      const phone = document.getElementById("storePhone");
      const whatsapp = document.getElementById("whatsappLink");

      if (title) title.textContent = settings.name || "تار و پود";
      if (description) description.textContent = settings.description || "";

      if (phone) {
        phone.textContent = settings.phone || "شماره تماس ثبت نشده است.";
      }

      if (whatsapp) {
        if (settings.whatsapp) {
          whatsapp.href =
            "https://wa.me/" + settings.whatsapp.replace(/\D/g, "");
          whatsapp.hidden = false;
        } else {
          whatsapp.hidden = true;
        }
      }

      productColumns = Math.max(
        1,
        Math.min(6, Number(settings.product_columns) || 2)
      );
    }

    applyProductColumns();

    const { data: categories, error: categoriesError } = await db
      .from("categories")
      .select("id, name")
      .order("id", { ascending: true });

    if (categoriesError) throw categoriesError;

    allCategories = categories || [];
    updateCategoryFilter();

    const { data: products, error: productsError } = await db
      .from("products")
      .select("*")
      .order("id", { ascending: false });

    if (productsError) throw productsError;

    await loadAllProductReviewStats();

    displayProducts(products || []);

    if (selectedProduct) {
      const updated = allProducts.find(
        item => String(item.id) === String(selectedProduct.id)
      );

      if (updated) {
        selectedProduct = updated;
        openProductDetails(updated);
      }
    }

  } catch (error) {
    console.error("خطای دریافت اطلاعات فروشگاه:", error);

    if (container) {
      container.textContent =
        "ارتباط با فروشگاه برقرار نشد. صفحه را تازه‌سازی کنید.";
    }
  }
}

/* مرتب‌سازی محصولات */

function sortProducts(products) {
  const sorted = [...products];

  switch (productSort) {
    case "rating":
      sorted.sort((a, b) => {
        const A = getProductRating(a.id);
        const B = getProductRating(b.id);

        if (!A.count && B.count) return 1;
        if (!B.count && A.count) return -1;

        return B.average - A.average || B.count - A.count;
      });
      break;

    case "popular":
      sorted.sort((a, b) => {
        const A = getProductRating(a.id);
        const B = getProductRating(b.id);

        return B.count - A.count || B.average - A.average;
      });
      break;

    case "cheap":
      sorted.sort((a, b) =>
        getProductPricing(a).finalPrice -
        getProductPricing(b).finalPrice
      );
      break;

    case "expensive":
      sorted.sort((a, b) =>
        getProductPricing(b).finalPrice -
        getProductPricing(a).finalPrice
      );
      break;

    default:
      sorted.sort((a, b) => Number(b.id) - Number(a.id));
  }

  return sorted;
}

/* نمایش محصولات */

function displayProducts(products) {
  allProducts = products || [];
  applyProductFilters();
}

function applyProductFilters() {
  const container = document.querySelector(".products");
  const searchInput = document.getElementById("productSearch");
  const categorySelect = document.getElementById("categoryFilter");
  const resultCount = document.getElementById("productResultCount");

  if (!container) return;

  const searchText = normalizeSearchText(
    searchInput ? searchInput.value : ""
  );

  const selectedCategory = categorySelect
    ? categorySelect.value
    : "all";

  let filtered = allProducts.filter(product => {
    const category = getProductCategory(product);

    const text = normalizeSearchText(
      (product.name || "") + " " +
      (product.description || "") + " " +
      category
    );

    return (
      (!searchText || text.includes(searchText)) &&
      (
        selectedCategory === "all" ||
        String(product.category_id) === selectedCategory
      )
    );
  });

  filtered = sortProducts(filtered);

  if (resultCount) {
    resultCount.textContent =
      filtered.length.toLocaleString("en-US") + " محصول پیدا شد";
  }

  container.innerHTML = "";
  applyProductColumns();

  if (!allProducts.length) {
    container.textContent = "هنوز محصولی به فروشگاه اضافه نشده است.";
    return;
  }

  if (!filtered.length) {
    container.textContent = "محصولی با این مشخصات پیدا نشد.";
    return;
  }

  filtered.forEach(product => {
    const card = document.createElement("article");
    card.className = "product";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");

    const imageBox = document.createElement("div");
    imageBox.className = "product-image-box";

    if (product.image_url) {
      const image = document.createElement("img");
      image.src = product.image_url;
      image.alt = product.name || "محصول";
      image.loading = "lazy";
      image.className = "product-image";
      imageBox.appendChild(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "product-placeholder";
      placeholder.textContent = "تار و پود";
      imageBox.appendChild(placeholder);
    }

    const badges = createProductBadges(product.id);

    if (badges.children.length) {
      imageBox.appendChild(badges);
    }

    const info = document.createElement("div");
    info.className = "product-info";

    const title = document.createElement("h3");
    title.className = "product-title";
    title.textContent = product.name || "محصول";

    const category = document.createElement("span");
    category.className = "product-category";
    category.textContent = getProductCategory(product);

    const rating = createProductRatingElement(product.id);

    const description = document.createElement("p");
    description.className = "product-description";
    description.textContent =
      product.description && product.description.trim()
        ? product.description
        : "توضیحاتی برای این محصول ثبت نشده است.";

    const bottom = document.createElement("div");
    bottom.className = "product-bottom";

    const price = createPriceElement(product);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "product-add-button";
    button.textContent = "افزودن به سبد خرید";

    button.onclick = event => {
      event.stopPropagation();
      addToCart(product);
    };

    bottom.append(price, button);
    info.append(title, category, rating, description, bottom);
    card.append(imageBox, info);

    card.addEventListener("click", () => {
      openProductDetails(product);
    });

    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openProductDetails(product);
      }
    });

    container.appendChild(card);
  });
}

/* مشخصات محصول */

function openProductDetails(product) {
  selectedProduct = product;

  const modal = document.getElementById("productModal");
  const content = document.getElementById("productDetailContent");
  const reviewMessage = document.getElementById("reviewMessage");
  const reviewForm = document.getElementById("reviewForm");

  if (!modal || !content) {
    showCartMessage("بخش مشخصات محصول در صفحه پیدا نشد.");
    return;
  }

  if (reviewForm) reviewForm.reset();
  if (reviewMessage) reviewMessage.textContent = "";

  content.innerHTML = "";

  if (product.image_url) {
    const image = document.createElement("img");
    image.src = product.image_url;
    image.alt = product.name || "محصول";
    image.className = "product-detail-image";
    content.appendChild(image);
  }

  const category = document.createElement("p");
  category.textContent = "دسته‌بندی: " + getProductCategory(product);
  category.style.color = "#796655";

  const title = document.createElement("h2");
  title.id = "productDetailName";
  title.className = "product-detail-name";
  title.textContent = product.name || "محصول";

  const rating = createProductRatingElement(product.id);
  rating.style.margin = "10px 0 15px";

  const description = document.createElement("p");
  description.className = "product-detail-description";
  description.textContent =
    product.description && product.description.trim()
      ? product.description
      : "توضیحاتی برای این محصول ثبت نشده است.";

  const price = createPriceElement(product, true);

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "review-submit";
  addButton.textContent = "افزودن به سبد خرید";
  addButton.onclick = () => addToCart(product);

  content.append(category, title, rating, description, price, addButton);

  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  loadProductReviews(product.id);
}

function closeProductDetails() {
  const modal = document.getElementById("productModal");
  if (!modal) return;

  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  selectedProduct = null;
}

function setupProductModal() {
  const modal = document.getElementById("productModal");
  const closeButton = document.getElementById("closeProductModal");

  if (closeButton) {
    closeButton.addEventListener("click", closeProductDetails);
  }

  if (modal) {
    modal.addEventListener("click", event => {
      if (event.target === modal) closeProductDetails();
    });
  }

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeProductDetails();
  });
}

/* نظرات */

async function loadProductReviews(productId) {
  const list = document.getElementById("reviewList");
  if (!list) return;

  try {
    const { data, error } = await db
      .from("reviews")
      .select("id, display_name, rating, comment, created_at")
      .eq("product_id", productId)
      .eq("is_approved", true)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (
      !selectedProduct ||
      String(selectedProduct.id) !== String(productId)
    ) return;

    list.innerHTML = "";

    if (!data || !data.length) {
      list.textContent = "هنوز نظری ثبت نشده است.";
      return;
    }

    data.forEach(review => {
      const item = document.createElement("article");
      item.className = "review-item";

      const name = document.createElement("strong");
      name.textContent = review.display_name || "مشتری";

      const stars = document.createElement("div");
      stars.className = "stars";
      stars.textContent =
        "★".repeat(Number(review.rating)) +
        "☆".repeat(5 - Number(review.rating));

      const comment = document.createElement("p");
      comment.textContent = review.comment || "";

      const date = document.createElement("small");

      if (review.created_at) {
        date.textContent =
          new Date(review.created_at).toLocaleDateString("en-US");
        date.style.color = "#9a8876";
      }

      item.append(name, stars, comment, date);
      list.appendChild(item);
    });

  } catch (error) {
    console.error("خطای دریافت نظرات:", error);
    list.textContent = "دریافت نظرات با مشکل روبه‌رو شد.";
  }
}

async function submitReview(event) {
  event.preventDefault();

  const message = document.getElementById("reviewMessage");
  const button = document.querySelector(
    "#reviewForm button[type='submit']"
  );

  if (!selectedProduct) {
    message.textContent = "ابتدا یک محصول را انتخاب کنید.";
    return;
  }

  const name = document.getElementById("reviewName").value.trim();
  const comment = document.getElementById("reviewComment").value.trim();

  const ratingInput = document.querySelector(
    'input[name="reviewRating"]:checked'
  );

  if (name.length < 2) {
    message.textContent = "نام نمایشی باید حداقل ۲ حرف باشد.";
    return;
  }

  if (!ratingInput) {
    message.textContent = "لطفاً امتیاز خود را انتخاب کنید.";
    return;
  }

  if (comment.length < 3) {
    message.textContent = "لطفاً نظر خود را کامل‌تر بنویسید.";
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "در حال ثبت نظر...";
  }

  try {
    const { error } = await db.from("reviews").insert([{
      product_id: selectedProduct.id,
      display_name: name,
      rating: Number(ratingInput.value),
      comment,
      is_approved: false
    }]);

    if (error) throw error;

    message.textContent = "نظر شما ثبت شد.";
    message.style.color = "#176c69";

    document.getElementById("reviewForm").reset();

  } catch (error) {
    console.error("خطای ثبت نظر:", error);

    message.textContent =
      "ثبت نظر انجام نشد: " + (error.message || "خطای ناشناخته");

    message.style.color = "#b3261e";

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "ثبت نظر";
    }
  }
}

function setupReviewForm() {
  const form = document.getElementById("reviewForm");

  if (form) {
    form.addEventListener("submit", submitReview);
  }
}

/* فیلترها */

function setupProductFilters() {
  const searchInput = document.getElementById("productSearch");
  const categorySelect = document.getElementById("categoryFilter");
  const clearButton = document.getElementById("clearProductFilters");

  if (searchInput) {
    searchInput.addEventListener("input", applyProductFilters);
  }

  if (categorySelect) {
    categorySelect.addEventListener("change", applyProductFilters);
  }

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      if (categorySelect) categorySelect.value = "all";
      applyProductFilters();
    });
  }
}

/* سبد خرید */

function addToCart(product) {
  const existing = cart.find(item => item.id === product.id);

  if (existing) {
    existing.quantity++;
  } else {
    cart.push({ ...product, quantity: 1 });
  }

  updateCart();
  showCartMessage("محصول به سبد خرید اضافه شد!");
}

function changeQuantity(index, amount) {
  if (!cart[index]) return;

  cart[index].quantity += amount;

  if (cart[index].quantity <= 0) {
    cart.splice(index, 1);
    updateCart();
    showCartMessage("محصول از سبد خرید حذف شد.");
    return;
  }

  updateCart();
}

function removeFromCart(index) {
  cart.splice(index, 1);
  updateCart();
  showCartMessage("محصول از سبد خرید حذف شد.");
}

function updateCart() {
  const container = document.getElementById("cartItems");
  const totalElement = document.getElementById("total");

  if (!container || !totalElement) return;

  container.innerHTML = "";

  let total = 0;
  let count = 0;

  cart.forEach((item, index) => {
    const price = getProductPricing(item).finalPrice;

    total += price * item.quantity;
    count += item.quantity;

    const row = document.createElement("div");

    Object.assign(row.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      flexWrap: "wrap",
      gap: "10px",
      padding: "14px 0",
      borderBottom: "1px solid #eee4dc"
    });

    const info = document.createElement("div");

    const name = document.createElement("strong");
    name.textContent = item.name || "محصول";

    const priceText = document.createElement("p");
    priceText.textContent = formatPrice(price);
    priceText.style.margin = "6px 0";

    info.append(name, priceText);

    const controls = document.createElement("div");

    const minus = document.createElement("button");
    minus.textContent = "−";
    minus.onclick = () => changeQuantity(index, -1);

    const quantity = document.createElement("strong");
    quantity.textContent = item.quantity.toLocaleString("en-US");
    quantity.style.margin = "0 8px";

    const plus = document.createElement("button");
    plus.textContent = "+";
    plus.onclick = () => changeQuantity(index, 1);

    const remove = document.createElement("button");
    remove.textContent = "حذف";
    remove.style.background = "#a34b42";
    remove.onclick = () => removeFromCart(index);

    controls.append(minus, quantity, plus, remove);
    row.append(info, controls);
    container.appendChild(row);
  });

  if (!cart.length) {
    container.textContent = "سبد خرید خالی است.";
  }

  totalElement.textContent = total.toLocaleString("en-US");

  let countElement = document.getElementById("cartCount");

  if (!countElement) {
    countElement = document.createElement("span");
    countElement.id = "cartCount";

    Object.assign(countElement.style, {
      display: "inline-block",
      background: "#796655",
      color: "white",
      padding: "5px 10px",
      borderRadius: "20px",
      marginRight: "8px",
      fontSize: "13px"
    });

    const heading = document.querySelector("#cart h2");

    if (heading) heading.appendChild(countElement);
  }

  countElement.textContent = count.toLocaleString("en-US") + " کالا";

  if (!cart.length) {
    clearDiscountPreview("سبد خرید خالی است.");
  } else if (appliedDiscountCode) {
    const phoneInput = document.getElementById("customerPhone");
    const phone = getCleanPhone(phoneInput ? phoneInput.value : "");

    checkDiscountCode(appliedDiscountCode, phone, false);
  }
}

/* تغییر شماره تلفن و بررسی دوباره سهمیه مشتری */

function setupDiscountPhoneListener() {
  const phoneInput = document.getElementById("customerPhone");
  if (!phoneInput) return;

  phoneInput.addEventListener("change", async () => {
    if (!appliedDiscountCode) return;

    const phone = getCleanPhone(phoneInput.value);

    await checkDiscountCode(appliedDiscountCode, phone, false);
  });
}

/* ثبت سفارش امن با تابع Supabase */

async function submitOrder(event) {
  event.preventDefault();

  const message = document.getElementById("orderMessage");
  const submitButton = document.getElementById("submitOrder");

  if (!cart.length) {
    message.textContent = "ابتدا یک محصول به سبد خرید اضافه کنید.";
    message.style.color = "#b3261e";
    return;
  }

  const customerName =
    document.getElementById("customerName").value.trim();

  const phone =
    document.getElementById("customerPhone").value.trim();

  const address =
    document.getElementById("customerAddress").value.trim();

  const postalCodeInput =
    document.getElementById("customerPostalCode").value.trim();

  const cleanPhone = getCleanPhone(phone);
  const postalCode = normalizeDigits(postalCodeInput).replace(/\D/g, "");

  if (customerName.length < 3) {
    message.textContent = "نام و نام خانوادگی را کامل وارد کنید.";
    message.style.color = "#b3261e";
    return;
  }

  if (cleanPhone.length < 10 || cleanPhone.length > 15) {
    message.textContent = "شماره تلفن را درست وارد کنید.";
    message.style.color = "#b3261e";
    return;
  }

  if (address.length < 15) {
    message.textContent = "لطفاً آدرس کامل‌تری وارد کنید.";
    message.style.color = "#b3261e";
    return;
  }

  if (!/^\d{10}$/.test(postalCode)) {
    message.textContent = "کد پستی باید دقیقاً ۱۰ رقم باشد.";
    message.style.color = "#b3261e";
    return;
  }

  const input = document.getElementById("discountCodeInput");
  const typedCode = input ? input.value.trim().toUpperCase() : "";

  if (typedCode && typedCode !== appliedDiscountCode) {
    message.textContent =
      "ابتدا کد تخفیف را با شماره تلفن خود بررسی کنید.";
    message.style.color = "#b3261e";
    return;
  }

  if (typedCode && !appliedDiscountCode) {
    message.textContent =
      "کد تخفیف هنوز تأیید نشده است. ابتدا آن را بررسی کنید.";
    message.style.color = "#b3261e";
    return;
  }

  const discountCode = appliedDiscountCode || null;

  submitButton.disabled = true;
  submitButton.textContent = "در حال ثبت سفارش...";

  try {
    const { data, error } = await db.rpc("create_store_order", {
      p_customer_name: customerName,
      p_phone: cleanPhone,
      p_address: address,
      p_postal_code: postalCode,
      p_items: getCartPayload(),
      p_discount_code: discountCode
    });

    if (error) throw error;

    const result = getRpcRow(data);

    if (!result || !result.order_id) {
      throw new Error("شماره سفارش از سرور دریافت نشد.");
    }

    const orderId = result.order_id;
    const finalTotal = Number(result.final_total) || 0;
    const discountAmount = Number(result.discount_amount) || 0;
    const subtotal = Number(result.subtotal) || 0;

    let successText =
      "سفارش شما با موفقیت ثبت شد. شماره سفارش: " + orderId;

    if (discountAmount > 0) {
      const discountPercent = subtotal > 0
        ? (discountAmount / subtotal) * 100
        : 0;

      successText +=
        " | درصد تخفیف: " +
        Number(discountPercent.toFixed(2)) + "%" +
        " | مبلغ تخفیف: " + formatPrice(discountAmount) +
        " | مبلغ نهایی: " + formatPrice(finalTotal);
    }

    message.textContent = successText;
    message.style.color = "green";

    cart = [];
    appliedDiscountCode = "";
    discountPreview = null;

    const discountInput = document.getElementById("discountCodeInput");
    if (discountInput) discountInput.value = "";

    updateCart();
    clearDiscountPreview();

    document.getElementById("orderForm").reset();

    showCartMessage("سفارش شما با موفقیت ثبت شد!");

  } catch (error) {
    console.error("خطای ثبت سفارش:", error);

    message.textContent =
      "خطای ثبت سفارش: " + (error.message || "خطای ناشناخته");

    message.style.color = "#b3261e";

  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "ثبت نهایی سفارش";
  }
}

/* راه‌اندازی فرم‌ها */

const orderForm = document.getElementById("orderForm");

if (orderForm) {
  orderForm.addEventListener("submit", submitOrder);
}

setupProductFilters();
setupProductModal();
setupReviewForm();
setupProductCardStyles();
setupProductSort();
setupDiscountBox();
setupDiscountPhoneListener();

/* به‌روزرسانی زنده محصولات */

db.channel("products-live")
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "products"
  }, displayStore)
  .subscribe();

db.channel("categories-live")
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "categories"
  }, displayStore)
  .subscribe();

db.channel("settings-live")
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "store_settings"
  }, displayStore)
  .subscribe();

db.channel("reviews-live")
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "reviews"
  }, async () => {
    await loadAllProductReviewStats();
    applyProductFilters();

    if (selectedProduct) {
      loadProductReviews(selectedProduct.id);
    }
  })
  .subscribe();

/* تازه‌سازی خودکار هر ۱۰ ثانیه */

setInterval(async () => {
  if (refreshRunning) return;

  refreshRunning = true;

  try {
    await loadAllProductReviewStats();
    applyProductFilters();

    if (selectedProduct) {
      loadProductReviews(selectedProduct.id);
    }

    if (appliedDiscountCode && cart.length) {
      const phoneInput = document.getElementById("customerPhone");
      const phone = getCleanPhone(phoneInput ? phoneInput.value : "");

      await checkDiscountCode(appliedDiscountCode, phone, false);
    }

  } catch (error) {
    console.error("خطای تازه‌سازی خودکار:", error);
  } finally {
    refreshRunning = false;
  }
}, 10000);

/* اجرای اولیه */

displayStore();
updateCart();
