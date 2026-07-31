package com.curatium.common.config;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class ClevelandMuseumConfiguration {

    @Bean
    HttpClient clevelandMuseumHttpClient(
            @Value("${curatium.cleveland-museum.connect-timeout}") Duration connectTimeout
    ) {
        return HttpClient.newBuilder()
                .connectTimeout(connectTimeout)
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    @Bean
    RestClient clevelandMuseumRestClient(
            @Value("${curatium.cleveland-museum.base-url}") String baseUrl,
            @Value("${curatium.cleveland-museum.read-timeout}") Duration readTimeout,
            @Qualifier("clevelandMuseumHttpClient") HttpClient httpClient
    ) {
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(readTimeout);

        return RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .defaultHeader("User-Agent", "Curatium/1.0")
                .build();
    }
}
