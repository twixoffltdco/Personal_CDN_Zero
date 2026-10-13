<?php
/**
 * examples/wordpress/personal-cdn-zero.php — мини-плагин WordPress со шорткодами
 * для доставки медиа через ваш Personal CDN Zero (без API, без платных хранилищ).
 *
 * Установка: скопируйте файл в wp-content/plugins/ и активируйте на странице «Плагины».
 *
 * Шорткоды:
 *   [pcdn url="https://cdn.example.personal/cdn/packs/file.ext?url=..." type="image"]      → <img>
 *   [pcdn url="..." type="video"]                                               → <video controls>
 *   [pcdn url="..." type="audio"]                                               → <audio controls>
 *   [pcdn url="..." type="link" text="Скачать мод"]                             → <a download>
 *   [pcdn_direct url="https://dl.dropboxuser...?dl=1"]                          → сам построит CDN-ссылку
 */

if (!defined('ABSPATH')) exit; // прямой доступ запрещён

add_shortcode('pcdn', function ($atts) {
    $a = shortcode_atts(['url' => '', 'type' => 'image', 'text' => 'Скачать', 'alt' => ''], $atts, 'pcdn');
    $url = esc_url($a['url']);
    if (!$url) return '<!-- pcdn: пустой url -->';

    switch ($a['type']) {
        case 'video':
            return '<video controls preload="metadata" style="max-width:100%"><source src="' . $url . '"></video>';
        case 'audio':
            return '<audio controls src="' . $url . '"></audio>';
        case 'link':
            return '<a class="pcdn-btn" href="' . $url . '" download>' . esc_html($a['text']) . '</a>';
        case 'image':
        default:
            return '<img src="' . $url . '" alt="' . esc_attr($a['alt']) . '" loading="lazy" style="max-width:100%">';
    }
});

// Строит CDN-ссылку из прямой ссылки облака прямо в контенте поста
add_shortcode('pcdn_direct', function ($atts) {
    $a = shortcode_atts(['url' => '', 'type' => 'image', 'alt' => ''], $atts, 'pcdn_direct');
    $site = rtrim(get_option('pcdn_site', home_url()), '/'); // задаётся в настройках ниже
    $cdn  = $site . '/cdn/packs/file.ext?url=' . rawurlencode(esc_url_raw($a['url']));
    return do_shortcode('[pcdn url="' . $cdn . '" type="' . $a['type'] . '" alt="' . $a['alt'] . '"]');
});

// Настройки → «Персональный CDN»: адрес вашего сайта Personal CDN Zero
add_action('admin_menu', function () {
    add_options_page('Персональный CDN', 'Персональный CDN', 'manage_options', 'pcdn-settings', function () {
        if (isset($_POST['pcdn_save'], $_POST['pcdn_nonce']) && wp_verify_nonce(sanitize_key($_POST['pcdn_nonce']), 'pcdn_opt')) {
            update_option('pcdn_site', esc_url_raw(wp_unslash($_POST['pcdn_site'])));
            echo '<div class="notice notice-success"><p>Сохранено.</p></div>';
        }
        $v = esc_attr(get_option('pcdn_site', ''));
        echo '<h1>Personal CDN Zero</h1><form method="post">'
           . '<input type="hidden" name="pcdn_nonce" value="' . wp_create_nonce('pcdn_opt') . '">'
           . '<p><label>Адрес сайта Personal CDN: <input name="pcdn_site" size="50" value="' . $v . '" placeholder="https://cdn.example.personal"></label></p>'
           . '<p><button name="pcdn_save" class="button button-primary">Сохранить</button></p></form>';
    });
});
