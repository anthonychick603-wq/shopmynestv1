<?php
/**
 * Plugin Name: MyNest Mobile App Bridge
 * Plugin URI:  https://shopmynest.com/
 * Description: Adds mobile buyer endpoints, reliable bearer-token authentication, and safe Stripe Tax sandbox checkout compatibility for The Nest Android app.
 * Version:     1.1.0
 * Author:      MyNest
 * Text Domain: mynest-mobile-app-bridge
 * Requires at least: 6.5
 * Requires PHP: 8.0
 * Requires Plugins: woocommerce,mynest-unified-marketplace
 * WC requires at least: 8.0
 * WC tested up to: 10.9
 */

defined( 'ABSPATH' ) || exit;

final class MyNest_Mobile_App_Bridge {
    private const VERSION = '1.1.0';
    private const NS      = 'the-nest/v1';

    private static bool $stripe_tax_sandbox_fallback_active = false;

    public static function init(): void {
        add_action( 'before_woocommerce_init', array( __CLASS__, 'declare_woocommerce_compatibility' ) );

        // WordPress hosts and reverse proxies do not always expose the standard
        // Authorization header to PHP. The app sends both Authorization and the
        // X-MyNest-Token fallback header, and this filter accepts either one.
        add_filter( 'determine_current_user', array( __CLASS__, 'authenticate_mobile_token' ), 5 );
        add_filter( 'rest_pre_dispatch', array( __CLASS__, 'authenticate_rest_request' ), 5, 3 );

        add_action( 'init', array( __CLASS__, 'register_report_type' ), 20 );
        add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ), 30 );

        // The supplied site has Stripe Tax enabled in Sandbox mode. When that
        // sandbox connector fails, it blocks WooCommerce Store API checkout with
        // "Taxes have not been calculated at the moment." In Sandbox only, use
        // WooCommerce's normal tax tables so test orders can still be placed.
        add_action( 'plugins_loaded', array( __CLASS__, 'configure_stripe_tax_sandbox_fallback' ), 999 );
        add_action( 'init', array( __CLASS__, 'configure_stripe_tax_sandbox_fallback' ), 999 );
        add_action( 'wp_loaded', array( __CLASS__, 'configure_stripe_tax_sandbox_fallback' ), 1 );
        add_action( 'rest_api_init', array( __CLASS__, 'configure_stripe_tax_sandbox_fallback' ), 999 );

        add_action( 'admin_notices', array( __CLASS__, 'dependency_notice' ) );
        add_action( 'admin_notices', array( __CLASS__, 'stripe_tax_sandbox_notice' ) );
    }

    public static function declare_woocommerce_compatibility(): void {
        if ( ! class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
            return;
        }

        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
            'custom_order_tables',
            __FILE__,
            true
        );

        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
            'cart_checkout_blocks',
            __FILE__,
            true
        );
    }

    public static function dependency_notice(): void {
        if ( ! current_user_can( 'activate_plugins' ) ) {
            return;
        }
        if ( class_exists( 'WooCommerce' ) && class_exists( 'TNM_REST' ) ) {
            return;
        }
        echo '<div class="notice notice-error"><p><strong>MyNest Mobile App Bridge:</strong> WooCommerce and MyNest Unified Marketplace must be active.</p></div>';
    }

    public static function stripe_tax_sandbox_notice(): void {
        if ( ! self::$stripe_tax_sandbox_fallback_active || ! current_user_can( 'manage_woocommerce' ) ) {
            return;
        }

        $screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
        if ( $screen && ! in_array( $screen->id, array( 'plugins', 'woocommerce_page_wc-settings', 'dashboard' ), true ) ) {
            return;
        }

        echo '<div class="notice notice-warning"><p><strong>MyNest checkout compatibility:</strong> Stripe Tax is currently in Sandbox mode, so failed sandbox tax requests are falling back to WooCommerce tax tables instead of blocking checkout. Configure Stripe Tax and switch it to Live mode before collecting real sales tax.</p></div>';
    }

    /**
     * Disable only the Stripe Tax sandbox handlers. Live mode is never bypassed.
     * This prevents a failed test connector from blocking both the website block
     * checkout and the mobile app while preserving live-mode tax safeguards.
     */
    public static function configure_stripe_tax_sandbox_fallback(): void {
        $options_class = '\\Stripe\\StripeTaxForWooCommerce\\WordPress\\Options';
        $plugin_class  = '\\Stripe\\StripeTaxForWooCommerce\\WordPress\\StripeTax_Plugin';
        $hooks_class   = '\\Stripe\\StripeTaxForWooCommerce\\WordPress\\Hooks';

        if ( ! class_exists( $options_class ) ) {
            return;
        }

        $enabled = (bool) apply_filters( 'mynest_mobile_stripe_tax_sandbox_fallback', true );
        if ( ! $enabled ) {
            return;
        }

        if ( is_callable( array( $options_class, 'is_live_mode_enabled' ) ) && ! $options_class::is_live_mode_enabled() ) {
            return;
        }

        $mode = (int) $options_class::get_mode_type();
        if ( defined( $options_class . '::MODE_TEST' ) ) {
            $test_mode = (int) constant( $options_class . '::MODE_TEST' );
        } else {
            $test_mode = 1;
        }

        if ( $mode !== $test_mode ) {
            return;
        }

        if ( class_exists( $plugin_class ) && is_callable( array( $plugin_class, 'unload' ) ) ) {
            $plugin_class::unload();
        }

        if ( class_exists( $hooks_class ) ) {
            remove_action(
                'woocommerce_store_api_checkout_order_processed',
                array( $hooks_class, 'handle_checkout_order_notice' ),
                10
            );
        }

        self::$stripe_tax_sandbox_fallback_active = true;
    }

    private static function token_from_request( ?WP_REST_Request $request = null ): string {
        $headers = array();

        if ( $request ) {
            $headers[] = (string) $request->get_header( 'x-mynest-token' );
            $headers[] = (string) $request->get_header( 'authorization' );
        }

        $server_keys = array(
            'HTTP_X_MYNEST_TOKEN',
            'HTTP_AUTHORIZATION',
            'REDIRECT_HTTP_AUTHORIZATION',
        );
        foreach ( $server_keys as $key ) {
            if ( isset( $_SERVER[ $key ] ) ) {
                $headers[] = (string) wp_unslash( $_SERVER[ $key ] );
            }
        }

        if ( function_exists( 'apache_request_headers' ) ) {
            $apache_headers = apache_request_headers();
            if ( is_array( $apache_headers ) ) {
                foreach ( array( 'X-MyNest-Token', 'x-mynest-token', 'Authorization', 'authorization' ) as $name ) {
                    if ( isset( $apache_headers[ $name ] ) ) {
                        $headers[] = (string) $apache_headers[ $name ];
                    }
                }
            }
        }

        foreach ( $headers as $header ) {
            $header = trim( $header );
            if ( ! $header ) {
                continue;
            }
            if ( 0 === stripos( $header, 'Bearer ' ) ) {
                $header = trim( substr( $header, 7 ) );
            }
            if ( $header ) {
                return sanitize_text_field( $header );
            }
        }

        return '';
    }

    private static function user_id_from_token( string $token ): int {
        if ( ! $token ) {
            return 0;
        }

        if ( class_exists( 'TNM_Auth' ) && is_callable( array( 'TNM_Auth', 'decode_token' ) ) ) {
            $payload = TNM_Auth::decode_token( $token );
            if ( ! is_wp_error( $payload ) && ! empty( $payload['sub'] ) ) {
                return absint( $payload['sub'] );
            }
        }

        // Preserve sessions issued by older versions of The Nest mobile app.
        $legacy_users = get_users(
            array(
                'meta_key'   => '_nest_mobile_token',
                'meta_value' => sanitize_text_field( $token ),
                'number'     => 1,
                'fields'     => 'ID',
            )
        );

        return $legacy_users ? absint( $legacy_users[0] ) : 0;
    }

    public static function authenticate_mobile_token( int|false $user_id ): int|false {
        if ( $user_id ) {
            return $user_id;
        }

        $token = self::token_from_request();
        $found = self::user_id_from_token( $token );
        return $found ?: $user_id;
    }

    public static function authenticate_rest_request( mixed $result, WP_REST_Server $server, WP_REST_Request $request ): mixed {
        if ( get_current_user_id() ) {
            return $result;
        }

        $route = (string) $request->get_route();
        if ( ! preg_match( '#^/(?:the-nest|nest-ops|nest-native|nest-labels|nest-shipping)/v1/#', $route ) ) {
            return $result;
        }

        $user_id = self::user_id_from_token( self::token_from_request( $request ) );
        if ( $user_id ) {
            wp_set_current_user( $user_id );
        }

        return $result;
    }

    private static function ensure_current_user( ?WP_REST_Request $request = null ): int {
        $user_id = get_current_user_id();
        if ( $user_id ) {
            return $user_id;
        }

        $user_id = self::user_id_from_token( self::token_from_request( $request ) );
        if ( $user_id ) {
            wp_set_current_user( $user_id );
        }

        return $user_id;
    }

    public static function register_report_type(): void {
        register_post_type(
            'mynest_report',
            array(
                'labels' => array(
                    'name'          => 'Product Reports',
                    'singular_name' => 'Product Report',
                    'menu_name'     => 'Product Reports',
                ),
                'public'              => false,
                'show_ui'             => true,
                'show_in_menu'        => class_exists( 'TNM_Admin' ) ? 'tnm-marketplace' : 'woocommerce',
                'supports'            => array( 'title', 'editor', 'author' ),
                'capability_type'     => 'post',
                'map_meta_cap'        => true,
                'exclude_from_search' => true,
                'show_in_rest'        => false,
            )
        );
    }

    public static function register_routes(): void {
        register_rest_route(
            self::NS,
            '/mobile-health',
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array( __CLASS__, 'mobile_health' ),
                'permission_callback' => '__return_true',
            )
        );
        register_rest_route(
            self::NS,
            '/orders',
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array( __CLASS__, 'orders' ),
                'permission_callback' => array( __CLASS__, 'logged_in' ),
            )
        );
        register_rest_route(
            self::NS,
            '/orders/(?P<id>\d+)',
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array( __CLASS__, 'order' ),
                'permission_callback' => array( __CLASS__, 'logged_in' ),
            )
        );
        register_rest_route(
            self::NS,
            '/products/(?P<id>\d+)/report',
            array(
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => array( __CLASS__, 'report_product' ),
                'permission_callback' => array( __CLASS__, 'logged_in' ),
            )
        );
        register_rest_route(
            self::NS,
            '/seller/application/status',
            array(
                'methods'             => WP_REST_Server::READABLE,
                'callback'            => array( __CLASS__, 'application_status' ),
                'permission_callback' => array( __CLASS__, 'logged_in' ),
            )
        );
        register_rest_route(
            self::NS,
            '/account/photo/upload',
            array(
                'methods'             => WP_REST_Server::CREATABLE,
                'callback'            => array( __CLASS__, 'upload_account_photo' ),
                'permission_callback' => array( __CLASS__, 'logged_in' ),
            )
        );
    }

    public static function mobile_health(): WP_REST_Response {
        return rest_ensure_response(
            array(
                'ok'                          => true,
                'version'                     => self::VERSION,
                'authenticated'               => get_current_user_id() > 0,
                'stripe_tax_sandbox_fallback' => self::$stripe_tax_sandbox_fallback_active,
            )
        );
    }

    public static function logged_in( WP_REST_Request $request ): bool|WP_Error {
        if ( self::ensure_current_user( $request ) ) {
            return true;
        }
        return new WP_Error( 'rest_login_required', 'Authentication is required.', array( 'status' => 401 ) );
    }

    public static function orders( WP_REST_Request $request ): WP_REST_Response {
        $page     = max( 1, absint( $request->get_param( 'page' ) ?: 1 ) );
        $per_page = max( 1, min( 100, absint( $request->get_param( 'per_page' ) ?: 20 ) ) );
        $result   = wc_get_orders(
            array(
                'customer_id' => get_current_user_id(),
                'limit'       => $per_page,
                'page'        => $page,
                'paginate'    => true,
                'orderby'     => 'date',
                'order'       => 'DESC',
                'status'      => array_keys( wc_get_order_statuses() ),
                'return'      => 'objects',
            )
        );

        return rest_ensure_response(
            array(
                'orders'      => array_map( array( __CLASS__, 'order_to_array' ), $result->orders ),
                'page'        => $page,
                'total'       => (int) $result->total,
                'total_pages' => (int) $result->max_num_pages,
            )
        );
    }

    public static function order( WP_REST_Request $request ): WP_REST_Response|WP_Error {
        $order = wc_get_order( absint( $request['id'] ) );
        if ( ! $order ) {
            return new WP_Error( 'order_not_found', 'Order not found.', array( 'status' => 404 ) );
        }
        $user_id = get_current_user_id();
        if ( (int) $order->get_customer_id() !== $user_id && ! user_can( $user_id, 'manage_woocommerce' ) ) {
            return new WP_Error( 'order_permission_denied', 'You cannot view this order.', array( 'status' => 403 ) );
        }
        return rest_ensure_response( self::order_to_array( $order ) );
    }

    public static function order_to_array( WC_Order $order ): array {
        $items      = array();
        $tracking   = array();
        $seller_ids = array();

        foreach ( $order->get_items() as $item_id => $item ) {
            if ( ! $item instanceof WC_Order_Item_Product ) {
                continue;
            }
            $product    = $item->get_product();
            $seller_id = function_exists( 'tnm_get_order_item_seller_id' ) ? tnm_get_order_item_seller_id( $item ) : 0;
            if ( $seller_id ) {
                $seller_ids[ $seller_id ] = true;
            }
            $items[] = array(
                'item_id'      => (int) $item_id,
                'product_id'   => (int) $item->get_product_id(),
                'variation_id' => (int) $item->get_variation_id(),
                'name'         => $item->get_name(),
                'quantity'     => (int) $item->get_quantity(),
                'subtotal'     => (float) $item->get_subtotal(),
                'total'        => (float) $item->get_total(),
                'tax'          => (float) $item->get_total_tax(),
                'image'        => $product ? wp_get_attachment_image_url( $product->get_image_id(), 'medium' ) : '',
                'seller_id'    => $seller_id,
                'seller_name'  => $seller_id && function_exists( 'tnm_seller_display_name' ) ? tnm_seller_display_name( $seller_id ) : '',
            );
        }

        foreach ( array_keys( $seller_ids ) as $seller_id ) {
            $number = sanitize_text_field( (string) $order->get_meta( '_tnm_tracking_' . $seller_id, true ) );
            if ( $number ) {
                $tracking[] = array(
                    'seller_id'   => (int) $seller_id,
                    'seller_name' => function_exists( 'tnm_seller_display_name' ) ? tnm_seller_display_name( $seller_id ) : '',
                    'number'      => $number,
                    'status'      => sanitize_key( (string) $order->get_meta( '_tnm_seller_status_' . $seller_id, true ) ),
                );
            }
        }

        return array(
            'id'              => $order->get_id(),
            'number'          => $order->get_order_number(),
            'status'          => $order->get_status(),
            'date_created'    => $order->get_date_created() ? $order->get_date_created()->date( DATE_ATOM ) : null,
            'currency'        => $order->get_currency(),
            'subtotal'        => (float) $order->get_subtotal(),
            'shipping_total'  => (float) $order->get_shipping_total(),
            'tax_total'       => (float) $order->get_total_tax(),
            'discount_total'  => (float) $order->get_discount_total(),
            'total'           => (float) $order->get_total(),
            'payment_method'  => $order->get_payment_method_title(),
            'shipping_method' => $order->get_shipping_method(),
            'billing'         => $order->get_address( 'billing' ),
            'shipping'        => $order->get_address( 'shipping' ),
            'items'           => $items,
            'tracking'        => $tracking,
            'customer_note'   => $order->get_customer_note(),
        );
    }

    public static function report_product( WP_REST_Request $request ): WP_REST_Response|WP_Error {
        $product = wc_get_product( absint( $request['id'] ) );
        if ( ! $product ) {
            return new WP_Error( 'product_not_found', 'Product not found.', array( 'status' => 404 ) );
        }

        $reason  = sanitize_text_field( (string) $request->get_param( 'reason' ) );
        $details = sanitize_textarea_field( (string) $request->get_param( 'details' ) );
        if ( ! $reason ) {
            return new WP_Error( 'report_reason_required', 'Choose a reason for the report.', array( 'status' => 422 ) );
        }

        $report_id = wp_insert_post(
            array(
                'post_type'    => 'mynest_report',
                'post_status'  => 'pending',
                'post_author'  => get_current_user_id(),
                'post_title'   => sprintf( 'Product #%d — %s', $product->get_id(), $reason ),
                'post_content' => $details,
            ),
            true
        );
        if ( is_wp_error( $report_id ) ) {
            return $report_id;
        }

        update_post_meta( $report_id, '_mynest_product_id', $product->get_id() );
        update_post_meta( $report_id, '_mynest_reason', $reason );
        update_post_meta( $report_id, '_mynest_product_url', get_permalink( $product->get_id() ) );
        update_post_meta( $report_id, '_mynest_reporter_id', get_current_user_id() );

        $admins = get_users( array( 'role__in' => array( 'administrator', 'shop_manager' ), 'fields' => array( 'user_email' ) ) );
        foreach ( $admins as $admin ) {
            if ( is_email( $admin->user_email ) ) {
                wp_mail( $admin->user_email, 'New MyNest product report', sprintf( "Product: %s\nReason: %s\nDetails: %s", $product->get_name(), $reason, $details ) );
            }
        }

        return rest_ensure_response( array( 'success' => true, 'report_id' => (int) $report_id ) );
    }

    public static function upload_account_photo(): WP_REST_Response|WP_Error {
        if ( empty( $_FILES['file'] ) ) {
            return new WP_Error( 'missing_file', 'A profile image is required in the file field.', array( 'status' => 422 ) );
        }

        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';

        $attachment_id = media_handle_upload( 'file', 0 );
        if ( is_wp_error( $attachment_id ) ) {
            return $attachment_id;
        }
        if ( ! wp_attachment_is_image( $attachment_id ) ) {
            wp_delete_attachment( $attachment_id, true );
            return new WP_Error( 'invalid_photo', 'The uploaded file must be an image.', array( 'status' => 422 ) );
        }

        $user_id = get_current_user_id();
        wp_update_post( array( 'ID' => $attachment_id, 'post_author' => $user_id ) );
        $url = (string) wp_get_attachment_image_url( $attachment_id, 'full' );
        update_user_meta( $user_id, 'thenest_profile_photo_id', $attachment_id );
        update_user_meta( $user_id, 'thenest_profile_photo_url', esc_url_raw( $url ) );

        return rest_ensure_response(
            array(
                'ok'        => true,
                'photo_id'  => (int) $attachment_id,
                'photo_url' => $url,
            )
        );
    }

    public static function application_status(): WP_REST_Response {
        $user_id = get_current_user_id();
        if ( function_exists( 'tnm_is_seller' ) && tnm_is_seller( $user_id ) ) {
            return rest_ensure_response( array( 'status' => 'approved' ) );
        }

        $applications = get_posts(
            array(
                'post_type'      => 'tnm_application',
                'post_status'    => array( 'pending', 'publish', 'draft' ),
                'author'         => $user_id,
                'posts_per_page' => 1,
                'orderby'        => 'date',
                'order'          => 'DESC',
            )
        );
        if ( ! $applications ) {
            return rest_ensure_response( array( 'status' => 'none' ) );
        }
        $application = $applications[0];
        $status      = sanitize_key( (string) get_post_meta( $application->ID, '_tnm_status', true ) ) ?: 'pending';
        return rest_ensure_response(
            array(
                'status'         => $status,
                'application_id' => $application->ID,
                'submitted_at'   => get_post_time( DATE_ATOM, true, $application ),
            )
        );
    }
}

MyNest_Mobile_App_Bridge::init();
