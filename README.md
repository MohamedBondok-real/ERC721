# BondokWeb3 ERC-721

عقد ذكي بسيط لإنشاء NFTs متوافقة مع معيار **ERC-721** على شبكة EVM. يسمح العقد لأي عنوان بعمل mint لرمز جديد، مع تمرير رابط metadata مخصص لكل Token.

> **حالة المشروع:** نموذج تعليمي (minimal educational example)، وليس مجموعة NFT جاهزة للإطلاق التجاري أو عقدًا مدققًا أمنيًا.

## المحتويات

- [نظرة سريعة](#نظرة-سريعة)
- [مكونات المشروع](#مكونات-المشروع)
- [المواصفات الحالية](#المواصفات-الحالية)
- [متطلبات التشغيل](#متطلبات-التشغيل)
- [النشر باستخدام Remix](#النشر-باستخدام-remix)
- [الاستخدام](#الاستخدام)
- [صيغة Metadata](#صيغة-metadata)
- [التكامل مع JavaScript و ethers](#التكامل-مع-javascript-و-ethers)
- [تدفق العمل](#تدفق-العمل)
- [اعتبارات الأمان والقيود](#اعتبارات-الأمان-والقيود)
- [تطوير نسخة production](#تطوير-نسخة-production)
- [الاختبار](#الاختبار)
- [الترخيص](#الترخيص)

## نظرة سريعة

العقد الموجود في [`BondokWeb3.sol`](./BondokWeb3.sol) يرث من:

- `ERC721`: التطبيق الأساسي لمعيار NFT.
- `ERC721URIStorage`: حفظ `tokenURI` منفصل لكل Token.

إعدادات المجموعة:

| العنصر | القيمة |
| --- | --- |
| اسم المجموعة | `Bondok Web3` |
| الرمز (Symbol) | `BW3` |
| أول Token ID | `0` |
| طريقة الـ mint | عامة، بدون صلاحيات أو رسوم مخصصة |
| URI | يحدده صاحب عملية الـ mint |
| التخزين | on-chain للـ URI فقط؛ الـ metadata والصورة خارج السلسلة |
| الترخيص المعلن في Solidity | MIT |

## مكونات المشروع

```text
.
├── BondokWeb3.sol     # العقد الذكي
├── nft-metadata.json   # مثال على NFT metadata
└── README.md          # توثيق المشروع
```

### `BondokWeb3.sol`

يحتوي العقد على متغير عداد خاص:

```solidity
uint256 private _tokenId;
```

وتبدأ قيمته من `0` تلقائيًا. عند استدعاء `mintNFT`:

1. يأخذ العقد قيمة العداد الحالية كـ Token ID.
2. ينشئ Token جديدًا لصالح `msg.sender`.
3. يحفظ قيمة `jsonUri` كـ `tokenURI` لهذا الـ Token.
4. يزيد العداد بمقدار واحد.
5. يعيد Token ID الناتج.

### `nft-metadata.json`

ملف JSON تجريبي يوضح شكل metadata الشائع في أسواق NFT، ويحتوي على:

- `name`
- `description`
- `image`
- `attributes`

وجود الملف داخل المستودع لا يعني أنه يُرفع تلقائيًا إلى IPFS أو يُستخدم تلقائيًا عند تنفيذ `mintNFT`. يجب رفعه إلى خدمة استضافة metadata، ثم تمرير رابط الملف إلى الدالة.

## المواصفات الحالية

### الدالة `mintNFT`

```solidity
function mintNFT(string memory jsonUri) public returns (uint256)
```

| المعامل | الوصف |
| --- | --- |
| `jsonUri` | رابط metadata الخاصة بالـ NFT، مثل `ipfs://...` أو رابط HTTPS |
| القيمة المعادة | Token ID الجديد |
| المستفيد | العنوان الذي نفذ المعاملة (`msg.sender`) |
| الرسوم | لا توجد رسوم مخصصة؛ يلزم فقط دفع gas للشبكة |
| الصلاحيات | أي عنوان يمكنه الاستدعاء |

### دوال ERC-721 الموروثة

بما أن العقد يرث من OpenZeppelin، فهو يوفر وظائف ERC-721 القياسية مثل:

- `ownerOf(tokenId)` لمعرفة المالك.
- `balanceOf(owner)` لمعرفة عدد الـ NFTs المملوكة.
- `tokenURI(tokenId)` للحصول على رابط metadata.
- `approve(to, tokenId)` و `getApproved(tokenId)`.
- `setApprovalForAll(operator, approved)` و `isApprovedForAll(owner, operator)`.
- `transferFrom(from, to, tokenId)`.
- `safeTransferFrom(from, to, tokenId)`.
- `supportsInterface(interfaceId)` لاكتشاف الواجهات المدعومة.

## متطلبات التشغيل

- محفظة متوافقة مع EVM، مثل MetaMask، عند النشر أو التفاعل من الواجهة.
- Compiler متوافق مع:

  ```text
  Solidity >= 0.8.31 و < 0.9.0
  ```

- مكتبات OpenZeppelin Contracts.
- عملة الشبكة لدفع gas.
- خدمة لاستضافة metadata والصور، ويفضل IPFS أو Arweave للإنتاج.

العقد الحالي يستورد OpenZeppelin مباشرة من GitHub باستخدام روابط بعيدة. هذا مناسب للتجربة السريعة، لكنه ليس الخيار الأفضل لإصدارات production؛ راجع [تطوير نسخة production](#تطوير-نسخة-production).

## النشر باستخدام Remix

هذه هي الطريقة الأسرع لتجربة العقد:

1. افتح [Remix IDE](https://remix.ethereum.org/).
2. أنشئ ملفًا باسم `BondokWeb3.sol` والصق محتوى العقد، أو ارفع الملف من هذا المستودع.
3. افتح تبويب **Solidity Compiler**.
4. اختر Compiler بإصدار `0.8.31` أو إصدارًا أحدث ضمن نطاق `0.8.x` المتوافق مع `^0.8.31`.
5. فعّل خيار **Auto compile** أو اضغط **Compile BondokWeb3.sol**.
6. انتقل إلى **Deploy & Run Transactions**.
7. اختر البيئة المناسبة:
   - `Remix VM` للتجارب المحلية السريعة.
   - `Injected Provider - MetaMask` للنشر على testnet أو mainnet.
8. اختر العقد `BondokWeb3` ثم اضغط **Deploy**.
9. وافق على المعاملة من المحفظة.
10. احتفظ بعنوان العقد المنشور؛ ستحتاجه للتفاعل معه من أي تطبيق أو مستكشف بلوكتشين.

> قبل النشر على شبكة حقيقية، تأكد من الشبكة والحساب والـ gas، وراجع التحذيرات التي يعرضها Remix. لا تستخدم mainnet للاختبار الأول.

## الاستخدام

### عمل Mint جديد

بعد نشر العقد:

1. جهّز ملف metadata بصيغة JSON.
2. ارفع الملف والصورة إلى IPFS أو خدمة موثوقة.
3. احصل على رابط JSON، ويفضل أن يكون بصيغة:

   ```text
   ipfs://<metadata-cid>
   ```

4. استدعِ `mintNFT` مع رابط JSON.
5. بعد تأكيد المعاملة، سيصبح الـ NFT مملوكًا للعنوان الذي نفذ المعاملة.
6. استدعِ `tokenURI(tokenId)` للتحقق من الرابط المحفوظ.

مثال:

```text
mintNFT("ipfs://bafybe.../metadata.json")
```

إذا كان هذا أول mint ناجح، فسيكون الـ Token ID الناتج `0`. والـ mint التالي سيكون `1`، وهكذا.

### قراءة بيانات Token

بعد معرفة Token ID:

```text
ownerOf(0)    -> عنوان المالك الحالي
tokenURI(0)   -> رابط metadata المحفوظ
```

يمكن استخدام مستكشف الشبكة لقراءة هذه الدوال من تبويب **Read Contract**، أو استدعاؤها من تطبيق JavaScript.

## صيغة Metadata

يحتوي [`nft-metadata.json`](./nft-metadata.json) على مثال مبسط:

```json
{
  "name": "Bondok Web3 #1",
  "description": "NFT for Bondok Web3 #2",
  "image": "ipfs://<image-cid>",
  "attributes": [
    {
      "trait_type": "category",
      "value": "Blockchain"
    },
    {
      "trait_type": "level",
      "value": "Beginner"
    }
  ]
}
```

إرشادات مهمة:

- استخدم `ipfs://` أو `ar://` بدل روابط gateway المركزية عندما يكون ذلك ممكنًا.
- يجب أن يشير `jsonUri` إلى **ملف JSON**، وليس إلى رابط الصورة مباشرة.
- يجب أن يشير الحقل `image` إلى الصورة نفسها.
- تحقق من صحة JSON قبل رفعه.
- تأكد من تطابق اسم الملف والـ CID والرابط الذي ستمرره إلى `mintNFT`.
- محتوى IPFS ثابت عند استخدام CID، لكن gateway المستخدم للوصول إليه قد يختلف.
- في الملف الحالي، رابط `image` هو رابط HTTPS إلى Pinata gateway. يمكن استبداله بصيغة `ipfs://...` لزيادة قابلية النقل بين الأسواق.

## التكامل مع JavaScript و ethers

بعد تثبيت `ethers` وتوفير عنوان العقد وABI، يمكن تنفيذ mint بهذا الشكل:

```js
import { ethers } from "ethers";

const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

const abi = [
  "function mintNFT(string jsonUri) returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)"
];

const contract = new ethers.Contract(
  "0xYOUR_CONTRACT_ADDRESS",
  abi,
  signer
);

const metadataUri = "ipfs://YOUR_METADATA_CID/metadata.json";
const transaction = await contract.mintNFT(metadataUri);
const receipt = await transaction.wait();

console.log("Mint transaction:", receipt.hash);
console.log("Metadata URI:", await contract.tokenURI(0));
```

ملاحظات:

- قيمة `returns (uint256)` موجودة في ABI، لكن نتيجة الدالة لا تظهر عادةً كقيمة مباشرة من transaction في الواجهة؛ للحصول على Token ID قبل الإرسال يمكن استخدام `staticCall`، أو تتبع أحداث ERC-721 في الـ receipt.
- بعد عمليات mint متعددة لا تفترض أن Token ID هو `0`؛ اقرأ الحدث أو احسبه حسب الحالة المعروفة للعقد.
- استخدم عنوان العقد وشبكة RPC الصحيحة، ولا تضع مفاتيح خاصة داخل كود الواجهة أو المستودع.

مثال لقراءة Token ID المتوقع قبل الإرسال باستخدام ethers v6:

```js
const nextTokenId = await contract.mintNFT.staticCall(metadataUri);
const transaction = await contract.mintNFT(metadataUri);
await transaction.wait();

console.log("Minted token:", nextTokenId.toString());
```

## تدفق العمل

```text
إنشاء metadata والصورة
          │
          ▼
رفع الملفات إلى IPFS / Arweave
          │
          ▼
الحصول على رابط metadata JSON
          │
          ▼
المستخدم يستدعي mintNFT(jsonUri)
          │
          ▼
إنشاء Token ID وتسليمه إلى msg.sender
          │
          ▼
حفظ tokenURI وربطه بالـ NFT
          │
          ▼
السوق أو التطبيق يقرأ metadata ويعرض الصورة
```

## اعتبارات الأمان والقيود

هذا العقد بسيط ومفيد للتعلم، لكنه يحتوي على قرارات يجب فهمها قبل استخدامه في مشروع فعلي:

1. **الـ mint متاح للجميع:** لا يوجد owner أو allowlist أو توقيع whitelist. أي عنوان يستطيع إنشاء عدد غير محدود من NFTs.
2. **لا يوجد سعر mint:** الدالة ليست `payable` ولا تجمع ETH أو أي عملة. المستخدم يدفع gas فقط.
3. **لا يوجد حد أقصى للإصدار:** لا توجد `maxSupply` أو آلية إيقاف (`pause`).
4. **لا توجد royalties:** العقد لا يطبق EIP-2981.
5. **الرابط يحدده المستخدم:** لا يوجد تحقق من أن `jsonUri` رابط صالح أو أنه يشير إلى JSON. يمكن تمرير سلسلة فارغة أو رابط غير صالح.
6. **الـ metadata خارج السلسلة:** العقد يحفظ URI فقط. فقدان ملف metadata أو الصورة من خدمة الاستضافة يؤثر على العرض.
7. **الاستيراد غير مثبت على إصدار:** العقد يستورد فرع `master` من OpenZeppelin. أي تغير مستقبلي في المصدر البعيد قد يؤثر على إعادة البناء أو التوافق.
8. **لا توجد اختبارات مرفقة:** يجب إضافة اختبارات unit وintegration قبل الاعتماد على العقد.
9. **لا يوجد عقد upgradeable:** بعد النشر لا يمكن تحديث منطق العقد من خلال آلية proxy؛ لذلك يجب مراجعة الكود قبل النشر.
10. **لا يوجد mint للمستلم بالنيابة:** الدالة تسك دائمًا إلى `msg.sender`. إذا احتجت mint إلى عنوان آخر، فهذه وظيفة مختلفة وتحتاج تصميمًا واختبارًا مناسبين.

> هذه النقاط ليست أخطاء في نموذج التعلم نفسه، لكنها حدود مهمة يجب ألا تُخفى عند استخدامه في بيئة حقيقية.

## تطوير نسخة production

قبل استخدام المشروع في production يُنصح بالآتي:

- تثبيت إصدار محدد من OpenZeppelin بدل الاستيراد من `master`.
- استخدام dependency manager مثل npm/Hardhat أو Foundry.
- تغيير الاستيرادات إلى نسخة محلية، مثل:

  ```solidity
  import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
  import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
  ```

- تحديد سياسة واضحة للـ mint: سعر، حد أقصى، allowlist، أو صلاحية minter.
- إضافة `Pausable` عند الحاجة إلى إيقاف الإصدار مؤقتًا.
- إضافة events مخصصة فقط إذا كانت الواجهة تحتاج بيانات إضافية؛ عملية ERC-721 نفسها تطلق `Transfer` عند نجاح mint.
- إضافة اختبارات تغطي mint، الترقيم، URI، التحويل، الصلاحيات، وحالات الفشل.
- تشغيل static analysis وأدوات مثل Slither، ثم إجراء مراجعة أمنية مستقلة.
- استخدام IPFS/Arweave وتثبيت الـ CIDs قبل mint.
- التحقق من العقد المنشور على مستكشف الشبكة.
- عدم وضع private keys أو secrets في repository أو frontend.

## الاختبار

لا توجد حاليًا بنية اختبار أو إعداد Hardhat/Foundry داخل المستودع. الحد الأدنى للاختبارات المقترحة:

- نشر العقد والتحقق من الاسم `Bondok Web3` والرمز `BW3`.
- التأكد من أن أول mint ينتج Token ID يساوي `0`.
- التأكد من أن المالك الأول هو `msg.sender`.
- التأكد من حفظ قيمة `jsonUri` عبر `tokenURI`.
- تنفيذ mint ثانٍ والتحقق من أن Token ID يساوي `1`.
- اختبار نقل NFT وعمليات approval الموروثة من ERC-721.
- اختبار فشل `ownerOf` و`tokenURI` عند تمرير Token ID غير موجود.
- اختبار أن فشل المعاملة لا يستهلك Token ID.

## الترخيص

العقد يعلن عن ترخيص **MIT** في ترويسة `BondokWeb3.sol` عبر SPDX identifier. راجع أيضًا تراخيص تبعيات OpenZeppelin قبل إعادة التوزيع أو استخدام المشروع ضمن منتج تجاري.

---

صُنع هذا المستودع كنقطة بداية صغيرة لفهم ERC-721 وmetadata وعمليات mint على شبكات EVM.
