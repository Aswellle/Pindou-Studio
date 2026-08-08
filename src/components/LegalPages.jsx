import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/* ═════════════════════════════════════════════════════════════
   法律文档版本化渲染
   每个文档由多个版本组成,支持:
   - 访问 /privacy /terms 默认展示最新版
   - 访问 /privacy/:versionId /terms/:versionId 翻看历史版本
   - 版本历史列表显示各版本发布日期,可跳转切换
   ═════════════════════════════════════════════════════════════ */

function LegalDocument({ versions, type, onBack }) {
  const { t } = useTranslation();
  const { versionId } = useParams();
  const current = versions.find(v => v.id === versionId) || versions[0];

  return (
    <div className="legal-page">
      <button className="legal-back-btn" onClick={onBack} aria-label={t('legal.back')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        <span>{t('legal.back')}</span>
      </button>
      <div className="legal-container">
        <h1>{current.title}</h1>
        <p className="legal-updated">
          {t('legal.published')} {current.date}
          {current.id === versions[0].id ? t('legal.currentSuffix') : t('legal.historySuffix')}
        </p>

        {/* 版本历史导航 */}
        <div className="legal-versions">
          <h3>{t('legal.history')}</h3>
          <div className="legal-versions-list">
            {versions.map(v => (
              <Link
                key={v.id}
                to={`/${type}/${v.id}`}
                className={`legal-version-link${v.id === current.id ? ' current' : ''}`}
              >
                <span className="legal-version-badge">v{v.version}</span>
                <span className="legal-version-date">{t('legal.published')} {v.date}</span>
                {v.id === versions[0].id && v.id !== current.id && (
                  <span className="legal-version-tag">{t('legal.latest')}</span>
                )}
                {v.id === current.id && (
                  <span className="legal-version-tag current">{t('legal.viewing')}</span>
                )}
              </Link>
            ))}
          </div>
        </div>

        {current.content}
      </div>

      <style>{`
        .legal-page {
          max-width: 720px;
          margin: 0 auto;
          padding: 32px 24px 64px;
          color: var(--text-primary);
          line-height: 1.8;
          height: 100%;
          overflow-y: auto;
          overflow-x: hidden;
          box-sizing: border-box;
        }
        .legal-page::-webkit-scrollbar {
          width: 6px;
        }
        .legal-page::-webkit-scrollbar-track {
          background: var(--bg-secondary);
          border-radius: 3px;
        }
        .legal-page::-webkit-scrollbar-thumb {
          background: var(--border-color);
          border-radius: 3px;
        }
        .legal-page::-webkit-scrollbar-thumb:hover {
          background: var(--text-muted);
        }
        .legal-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          margin-bottom: 20px;
          font-size: 14px;
          font-weight: 500;
          color: var(--text-secondary);
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
        }
        .legal-back-btn:hover {
          color: var(--accent);
          border-color: var(--accent);
          background: var(--accent-soft);
        }
        .legal-back-btn svg { flex-shrink: 0; }
        @media (max-width: 640px) {
          .legal-back-btn {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            margin-bottom: 0;
            padding: 12px 24px;
            font-size: 15px;
            background: var(--text-primary);
            color: white;
            border: none;
            border-radius: 24px;
            box-shadow: 0 4px 16px rgba(43,36,32,0.2);
            z-index: 50;
          }
          .legal-back-btn:hover {
            background: var(--accent);
            color: white;
            border: none;
          }
          .legal-back-btn:active {
            transform: translateX(-50%) scale(0.96);
          }
          .legal-page { padding-bottom: 88px; }
        }
        .legal-container h1 {
          font-size: 28px;
          font-weight: 700;
          margin-bottom: 8px;
        }
        .legal-updated {
          color: var(--text-muted);
          font-size: 13px;
          margin-bottom: 24px;
        }
        /* 版本历史区 */
        .legal-versions {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 32px;
        }
        .legal-versions h3 {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-secondary);
          margin: 0 0 10px;
        }
        .legal-versions-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .legal-version-link {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          border-radius: 8px;
          text-decoration: none;
          color: var(--text-primary);
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          transition: all 0.2s;
        }
        .legal-version-link:hover {
          border-color: var(--accent);
        }
        .legal-version-link.current {
          border-color: var(--accent);
          background: var(--accent-soft);
        }
        .legal-version-badge {
          font-size: 12px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 999px;
          background: var(--accent);
          color: white;
          flex-shrink: 0;
        }
        .legal-version-date {
          font-size: 13px;
          color: var(--text-secondary);
          flex: 1;
        }
        .legal-version-tag {
          font-size: 11px;
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .legal-version-tag.current {
          color: var(--accent);
          font-weight: 600;
        }
        .legal-container h2 {
          font-size: 18px;
          font-weight: 600;
          margin-top: 32px;
          margin-bottom: 12px;
          color: var(--text-primary);
        }
        .legal-container h3 {
          font-size: 15px;
          font-weight: 600;
          margin-top: 16px;
          margin-bottom: 8px;
        }
        .legal-container p {
          margin-bottom: 12px;
          font-size: 14px;
        }
        .legal-container ul {
          padding-left: 24px;
          margin-bottom: 12px;
        }
        .legal-container li {
          margin-bottom: 6px;
          font-size: 14px;
        }
        .legal-container a {
          color: var(--accent);
          text-decoration: none;
        }
        .legal-container a:hover {
          text-decoration: underline;
        }
        @media (max-width: 640px) {
          .legal-page { padding: 24px 16px 48px; }
          .legal-container h1 { font-size: 22px; }
          .legal-container h2 { font-size: 16px; }
        }
      `}</style>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════
   隐私政策 版本历史
   ═════════════════════════════════════════════════════════════ */

const PRIVACY_VERSIONS = [
  {
    id: 'v2',
    version: '2.0',
    date: '2026年8月7日',
    title: '隐私政策',
    content: (
      <>
        <section>
          <h2>1. 引言</h2>
          <p>拼豆Studio（"我们"、"本工具"）尊重并保护用户隐私。本隐私政策说明我们如何收集、使用和保护您的个人信息，并记录政策版本历史。</p>
          <p>本工具采用"云端账号 + 本地作品"的混合数据架构：<strong>账号与个人资料存于云端</strong>（用于跨设备登录与身份展示），<strong>您的拼豆作品数据默认保存在您的浏览器本地</strong>，我们无法访问。</p>
        </section>

        <section>
          <h2>2. 我们收集的信息</h2>
          <h3>2.1 您主动提供的信息</h3>
          <ul>
            <li><strong>账户信息</strong>：注册时您提供邮箱地址（必需，用于邮箱验证码验证与登录）与密码；可选设置昵称、上传头像。</li>
            <li><strong>作品数据</strong>：您创建的拼豆图案（画布数据、网格尺寸、调色板选择）保存在您的浏览器本地存储（localStorage）中，不会上传至我们的服务器。</li>
            <li><strong>使用偏好</strong>：语言设置、收藏的模板、教程阅读进度等保存在本地浏览器中。</li>
          </ul>
          <h3>2.2 自动收集的信息</h3>
          <ul>
            <li><strong>浏览器语言</strong>：用于自动适配界面语言（仅支持简体中文、英语、日语、韩语四种，其余语言回退简体中文）。</li>
            <li><strong>使用数据</strong>：我们使用 Vercel Analytics 收集匿名化的访问数据（页面、来源网站、设备类型、浏览器类型、操作系统、国家级别地理位置）。</li>
            <li><strong>性能数据</strong>：我们使用 Vercel Speed Insights 收集网页性能指标（LCP、CLS 等）。</li>
            <li>本工具不使用 Cookie，不接入任何广告网络或第三方追踪器。</li>
          </ul>
        </section>

        <section>
          <h2>3. 信息的使用</h2>
          <ul>
            <li><strong>账号验证</strong>：注册、登录与找回密码通过<strong>邮箱验证码</strong>完成 —— 验证码经邮件发送，在站点内输入验证，全程无需打开外部链接。</li>
            <li><strong>身份展示</strong>：您的昵称与头像（若设置）用于站点内的身份展示；头像为公开可见（头像展示需要）。</li>
            <li><strong>界面适配</strong>：根据浏览器语言自动切换界面语言。</li>
            <li><strong>平台运营管理</strong>：为保障服务安全与正常运营，管理员可在后台"用户管理"中查看注册用户的邮箱、昵称、角色、邮箱验证状态与注册时间。该信息仅管理员可访问，<strong>不包含密码等任何敏感数据</strong>，也不用于用户行为追踪。</li>
            <li><strong>服务改进</strong>：匿名化的使用数据用于改进功能与性能。</li>
          </ul>
        </section>

        <section>
          <h2>4. 信息的存储与安全</h2>
          <ul>
            <li><strong>云端数据</strong>：账号与个人资料存储于 Supabase（PostgreSQL 数据库与对象存储），数据传输全程 TLS 加密；密码经哈希处理存储，任何人（包括管理员）无法读取明文。</li>
            <li><strong>验证码邮件</strong>：通过第三方邮件服务（163 SMTP）发送，仅用于身份验证。</li>
            <li><strong>作品数据</strong>：保存在您的浏览器本地存储中，我们无法访问或收集。</li>
            <li><strong>建议</strong>：不在公共或共享设备上保持登录状态；定期导出重要作品；使用最新版本浏览器。</li>
          </ul>
        </section>

        <section>
          <h2>5. 第三方服务</h2>
          <ul>
            <li><strong>Supabase</strong>：数据库、认证、文件存储（头像），数据处理受其<a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">隐私政策</a>约束。</li>
            <li><strong>Vercel</strong>：网站托管与匿名分析，数据处理受其<a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">隐私政策</a>约束。</li>
            <li><strong>邮件服务商</strong>：发送验证码邮件（仅传递邮箱地址与验证码）。</li>
          </ul>
        </section>

        <section>
          <h2>6. 您的权利</h2>
          <ul>
            <li><strong>访问与更正</strong>：您可在"个人资料"中随时修改昵称、更换头像。</li>
            <li><strong>删除</strong>：我们暂未提供账号自助删除功能；如需删除账号及相关云端数据，请通过下方邮箱联系我们，我们将在合理期限内处理。</li>
            <li><strong>作品数据</strong>：您的作品保存在浏览器中，可随时导出或删除。</li>
            <li><strong>撤回同意</strong>：清除浏览器本地数据即可撤回本地数据的存储。</li>
          </ul>
        </section>

        <section>
          <h2>7. 未成年人隐私保护</h2>
          <p>根据中国《个人信息保护法》和《儿童个人信息网络保护规定》，不满十四周岁的未成年人的个人信息属于敏感个人信息。</p>
          <p>本工具的核心功能（拼豆图纸设计、图片转拼豆、模板浏览、教程阅读）无需注册即可使用，对所有人开放。</p>
          <p>当您选择注册账户时，即表示您确认<strong>已年满十四周岁</strong>，或者<strong>已取得您父母或监护人的同意</strong>。如果我们发现在未获监护人同意的情况下收集了不满十四周岁未成年人的个人信息，我们将尽快删除相关数据。</p>
        </section>

        <section>
          <h2>8. 政策更新与版本历史</h2>
          <p>我们可能不时更新本隐私政策。所有版本（含历史版本）均在本页面发布，并标注发布日期；最新版本自发布之日起生效。您可随时在本页顶部"版本历史"中查阅并跳转查看旧版本。</p>
        </section>

        <section>
          <h2>9. 联系我们</h2>
          <p>如果您对本隐私政策有任何疑问或需要行使您的权利，请通过以下方式联系我们：</p>
          <ul>
            <li>邮箱：<a href="mailto:noreply_tangnotes@163.com">noreply_tangnotes@163.com</a></li>
            <li>GitHub：<a href="https://github.com/Aswellle/Pindou-Studio" target="_blank" rel="noopener noreferrer">github.com/Aswellle/Pindou-Studio</a>（提交 Issue）</li>
          </ul>
        </section>
      </>
    ),
  },
  {
    id: 'v1',
    version: '1.0',
    date: '2026年8月1日',
    title: '隐私政策（历史版本）',
    content: (
      <>
        <section>
          <h2>1. 引言</h2>
          <p>拼豆Studio（"我们"、"本工具"）尊重并保护用户隐私。本隐私政策说明我们如何收集、使用和保护您的个人信息。本工具是一个运行在浏览器中的在线拼豆图纸设计工具，绝大多数数据存储在您的本地浏览器中。</p>
        </section>

        <section>
          <h2>2. 我们收集的信息</h2>
          <h3>2.1 您主动提供的信息</h3>
          <ul>
            <li><strong>账户信息</strong>：当您注册账户时，我们收集您提供的邮箱地址和由此衍生的用户名。这些信息存储在您的浏览器本地存储（localStorage）中。</li>
            <li><strong>作品数据</strong>：您使用本工具创建的拼豆图案（包括画布数据、网格尺寸、调色板选择）保存在您的浏览器本地存储中。</li>
            <li><strong>使用偏好</strong>：您的语言设置、最近使用的颜色、教程阅读进度、收藏的模板等均存储在浏览器本地存储中。</li>
          </ul>
          <h3>2.2 自动收集的信息</h3>
          <ul>
            <li><strong>使用数据</strong>：我们使用 Vercel Analytics 收集匿名化的访问数据，包括访问的页面、来源网站、设备类型、浏览器类型、操作系统和地理位置（国家级）。</li>
            <li><strong>性能数据</strong>：我们使用 Vercel Speed Insights 收集网页性能指标（核心网页指标），包括最大内容绘制（LCP）、首次输入延迟（FID）、累积布局偏移（CLS）等。</li>
          </ul>
        </section>

        <section>
          <h2>3. 信息的使用</h2>
          <p>我们使用收集的信息用于：提供和改善服务、个性化体验、安全防护、数据分析。</p>
        </section>

        <section>
          <h2>4. 信息的存储</h2>
          <p><strong>本地存储</strong>：您的账户信息、作品数据和偏好设置全部存储在您自己的浏览器本地存储（localStorage）中。我们不会将这些信息上传到任何服务器。</p>
          <p><strong>第三方服务</strong>：</p>
          <ul>
            <li><strong>Vercel</strong>：本网站托管于 Vercel 平台。Vercel Analytics 和 Speed Insights 会收集匿名化的使用数据和性能数据。Vercel 的数据处理受其<a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">隐私政策</a>约束。</li>
            <li><strong>无 Cookie</strong>：本工具不使用 Cookie。所有本地数据存储通过浏览器 localStorage 实现。</li>
            <li><strong>无第三方广告或追踪器</strong>：本工具不接入任何广告网络或第三方追踪服务。</li>
          </ul>
        </section>

        <section>
          <h2>5. 您的权利</h2>
          <p>根据您所在地区的适用法律（包括中国的《个人信息保护法》（PIPL）和欧盟的《通用数据保护条例》（GDPR）），您享有以下权利：</p>
          <ul>
            <li><strong>访问权</strong>：您可以随时在浏览器开发者工具中查看本地存储的所有数据。</li>
            <li><strong>删除权</strong>：您可以通过以下方式删除您的数据：
              <ul>
                <li>在工具内退出登录（删除账户信息）</li>
                <li>清除浏览器本地存储（设置 → 隐私 → 清除浏览数据）</li>
                <li>删除单个作品（在"我的作品"中操作）</li>
              </ul>
            </li>
            <li><strong>可携带权</strong>：由于数据全部存储在您的浏览器中，您可以随时导出。</li>
            <li><strong>撤回同意</strong>：您可以随时通过清除浏览器数据撤回对数据收集的同意。</li>
          </ul>
        </section>

        <section>
          <h2>6. 数据安全</h2>
          <p>我们采用合理的技术措施保护您的数据。但由于数据存储在您的浏览器本地存储中，数据的安全性也取决于您设备和浏览器的安全。我们建议您：</p>
          <ul>
            <li>不要在公共或共享设备上保存账户信息</li>
            <li>定期清理不需要的本地数据</li>
            <li>使用最新版本的浏览器以获得最佳安全性</li>
          </ul>
        </section>

        <section>
          <h2>7. 未成年人隐私保护</h2>
          <p>根据中国《个人信息保护法》和《儿童个人信息网络保护规定》，不满十四周岁的未成年人的个人信息属于敏感个人信息。</p>
          <p>本工具的核心功能（拼豆图纸设计、图片转拼豆、模板浏览、教程阅读）无需注册即可使用，对所有人开放。</p>
          <p>当您选择注册账户时，即表示您确认<strong>已年满十四周岁</strong>，或者<strong>已取得您父母或监护人的同意</strong>。如果我们发现在未获监护人同意的情况下收集了不满十四周岁未成年人的个人信息，我们将尽快删除相关数据。</p>
          <p>家长或监护人如发现自己的孩子向我们提供了个人信息，请联系我们以便我们删除相关数据。</p>
        </section>

        <section>
          <h2>8. 政策更新</h2>
          <p>我们可能不时更新本隐私政策。更新后的政策将在本页面上发布，并更新"最后更新"日期。我们建议您定期查看本政策以了解任何变更。</p>
        </section>

        <section>
          <h2>9. 联系我们</h2>
          <p>如果您对本隐私政策有任何疑问或需要行使您的权利，请通过以下方式联系我们：</p>
          <ul>
            <li>GitHub：<a href="https://github.com/Aswellle/Pindou-Studio" target="_blank" rel="noopener noreferrer">github.com/Aswellle/Pindou-Studio</a>（提交 Issue）</li>
          </ul>
        </section>
      </>
    ),
  },
];

/* ═════════════════════════════════════════════════════════════
   服务条款 版本历史
   ═════════════════════════════════════════════════════════════ */

const TERMS_VERSIONS = [
  {
    id: 'v2',
    version: '2.0',
    date: '2026年8月7日',
    title: '服务条款',
    content: (
      <>
        <section>
          <h2>1. 接受条款</h2>
          <p>使用拼豆Studio（"本工具"）即表示您同意遵守本服务条款。如果您不同意本条款的任何部分，请停止使用本工具。</p>
        </section>

        <section>
          <h2>2. 服务描述</h2>
          <p>拼豆Studio是一个在线拼豆图纸设计工具，提供以下核心功能：</p>
          <ul>
            <li>在线绘制拼豆图案（画笔、橡皮、填充、抓手工具）</li>
            <li>上传图片智能转换为拼豆图案（基于CIEDE2000色彩匹配算法）</li>
            <li>支持Perler、Hama、Artkal三大品牌色卡</li>
            <li>导出专业级PNG/SVG拼豆图纸</li>
            <li>云端模板库、个人作品管理（保存在您的浏览器本地）与图文教程</li>
            <li>可选账号体系：注册后可跨设备登录，设置昵称与头像</li>
          </ul>
        </section>

        <section>
          <h2>3. 用户账户与安全</h2>
          <p>注册账户需通过<strong>邮箱验证码</strong>完成邮箱归属验证（验证码经邮件发送，在站点内输入）。您有责任保护自己的密码，不在公共设备上保持登录状态。账户仅供本人使用；如怀疑账户被盗用，请立即通过"忘记密码"流程重置密码。</p>
        </section>

        <section>
          <h2>4. 用户内容与作品</h2>
          <p>您使用本工具创建的所有拼豆图案和作品均归您所有。这些数据存储在您的浏览器本地存储中，我们不会访问、收集或上传您的作品内容到任何服务器。请定期导出备份重要作品。</p>
        </section>

        <section>
          <h2>5. 模板库</h2>
          <p>站点内置模板与云端模板库由平台提供并维护（由管理员管理）。模板图案仅供个人创作参考使用，未经许可不得用于商业分发。</p>
        </section>

        <section>
          <h2>6. 使用规范</h2>
          <p>您同意不使用本工具从事以下活动：</p>
          <ul>
            <li>上传包含违法、侵权、色情、暴力内容的图片</li>
            <li>试图破坏、攻击或干扰本工具的正常运行</li>
            <li>反向工程、反编译或试图提取本工具的源代码（开源部分除外）</li>
            <li>恶意批量注册账号、滥用验证码服务</li>
            <li>将本工具用于任何非法目的</li>
          </ul>
        </section>

        <section>
          <h2>7. 知识产权</h2>
          <p>本工具的源代码在 MIT 开源许可证下发布（可在 <a href="https://github.com/Aswellle/Pindou-Studio" target="_blank" rel="noopener noreferrer">GitHub</a> 查看）。本工具的界面设计、算法实现、模板图案和文档受知识产权法保护。</p>
        </section>

        <section>
          <h2>8. 免责声明</h2>
          <p><strong>本工具按"原样"提供，不附带任何明示或默示的保证。</strong>我们不保证：</p>
          <ul>
            <li>本工具不会中断或无错误</li>
            <li>存储在浏览器本地存储中的数据不会丢失（清除浏览器数据会导致数据丢失）</li>
            <li>本工具能满足您的所有特定需求</li>
          </ul>
          <p>由于作品数据存储在您的本地浏览器中，因清除浏览器缓存、更换设备或浏览器故障导致的数据丢失，我们不承担责任。建议您定期导出重要作品。</p>
        </section>

        <section>
          <h2>9. 责任限制</h2>
          <p>在法律允许的最大范围内，拼豆Studio的开发者对因使用或无法使用本工具而导致的任何直接、间接、附带、特殊或后果性损害不承担责任。</p>
        </section>

        <section>
          <h2>10. 账号终止</h2>
          <p>如您违反本条款或滥用本服务，我们有权暂停或终止您的账号。终止账号不会影响您浏览器中已保存的作品数据。</p>
        </section>

        <section>
          <h2>11. 条款修改与版本历史</h2>
          <p>我们可能不时修改本服务条款。所有版本（含历史版本）均在本页面发布，并标注发布日期；最新版本自发布之日起生效。继续使用本工具即表示您接受修改后的条款。您可随时在本页顶部"版本历史"中查阅并跳转查看旧版本。</p>
        </section>

        <section>
          <h2>12. 适用法律</h2>
          <p>本服务条款受中华人民共和国法律管辖。如条款与适用法律冲突，以法律规定为准。</p>
        </section>

        <section>
          <h2>13. 联系我们</h2>
          <p>如果您对本服务条款有任何疑问，请通过以下方式联系我们：</p>
          <ul>
            <li>邮箱：<a href="mailto:noreply_tangnotes@163.com">noreply_tangnotes@163.com</a></li>
            <li>GitHub：<a href="https://github.com/Aswellle/Pindou-Studio" target="_blank" rel="noopener noreferrer">github.com/Aswellle/Pindou-Studio</a>（提交 Issue）</li>
          </ul>
        </section>
      </>
    ),
  },
  {
    id: 'v1',
    version: '1.0',
    date: '2026年8月1日',
    title: '服务条款（历史版本）',
    content: (
      <>
        <section>
          <h2>1. 接受条款</h2>
          <p>使用拼豆Studio（"本工具"）即表示您同意遵守本服务条款。如果您不同意本条款的任何部分，请停止使用本工具。</p>
        </section>

        <section>
          <h2>2. 服务描述</h2>
          <p>拼豆Studio是一个免费的在线拼豆图纸设计工具，提供以下核心功能：</p>
          <ul>
            <li>在线绘制拼豆图案（画笔、橡皮、填充、抓手工具）</li>
            <li>上传图片智能转换为拼豆图案（基于CIEDE2000色彩匹配算法）</li>
            <li>支持Perler、Hama、Artkal三大品牌色卡</li>
            <li>导出专业级PNG/SVG拼豆图纸</li>
            <li>内置模板库和图文教程</li>
          </ul>
        </section>

        <section>
          <h2>3. 用户账户</h2>
          <p>本工具提供可选的注册登录功能。注册账户的信息（邮箱、用户名）存储在您的浏览器本地存储中。您有责任保护自己的账户信息，不在公共设备上保存登录状态。</p>
        </section>

        <section>
          <h2>4. 用户内容</h2>
          <p>您使用本工具创建的所有拼豆图案和作品均归您所有。这些数据存储在您的浏览器本地存储中，我们不会访问、收集或上传您的作品内容到任何服务器。</p>
        </section>

        <section>
          <h2>5. 使用规范</h2>
          <p>您同意不使用本工具从事以下活动：</p>
          <ul>
            <li>上传包含违法、侵权、色情、暴力内容的图片</li>
            <li>试图破坏、攻击或干扰本工具的正常运行</li>
            <li>反向工程、反编译或试图提取本工具的源代码（开源部分除外）</li>
            <li>将本工具用于任何非法目的</li>
          </ul>
        </section>

        <section>
          <h2>6. 知识产权</h2>
          <p>本工具的源代码在 MIT 开源许可证下发布（可在 <a href="https://github.com/Aswellle/Pindou-Studio" target="_blank" rel="noopener noreferrer">GitHub</a> 查看）。本工具的界面设计、算法实现和文档受知识产权法保护。</p>
        </section>

        <section>
          <h2>7. 免责声明</h2>
          <p><strong>本工具按"原样"提供，不附带任何明示或默示的保证。</strong>我们不保证：</p>
          <ul>
            <li>本工具不会中断或无错误</li>
            <li>存储在浏览器本地存储中的数据不会丢失（清除浏览器数据会导致数据丢失）</li>
            <li>本工具能满足您的所有特定需求</li>
          </ul>
          <p>由于数据存储在您的本地浏览器中，因清除浏览器缓存、更换设备或浏览器故障导致的数据丢失，我们不承担责任。建议您定期导出重要作品。</p>
        </section>

        <section>
          <h2>8. 责任限制</h2>
          <p>在法律允许的最大范围内，拼豆Studio的开发者对因使用或无法使用本工具而导致的任何直接、间接、附带、特殊或后果性损害不承担责任。</p>
        </section>

        <section>
          <h2>9. 条款修改</h2>
          <p>我们可能不时修改本服务条款。修改后的条款将在本页面上发布。继续使用本工具即表示您接受修改后的条款。</p>
        </section>

        <section>
          <h2>10. 适用法律</h2>
          <p>本服务条款受中华人民共和国法律管辖。如条款与适用法律冲突，以法律规定为准。</p>
        </section>

        <section>
          <h2>11. 联系我们</h2>
          <p>如果您对本服务条款有任何疑问，请通过以下方式联系我们：</p>
          <ul>
            <li>GitHub：<a href="https://github.com/Aswellle/Pindou-Studio" target="_blank" rel="noopener noreferrer">github.com/Aswellle/Pindou-Studio</a>（提交 Issue）</li>
          </ul>
        </section>
      </>
    ),
  },
];

/* ── 导出组件 ─────────────────────────────────────────────── */

export function PrivacyPolicy({ onBack }) {
  return <LegalDocument versions={PRIVACY_VERSIONS} type="privacy" onBack={onBack} />;
}

export function TermsOfService({ onBack }) {
  return <LegalDocument versions={TERMS_VERSIONS} type="terms" onBack={onBack} />;
}
